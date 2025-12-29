/**
 * Git Operations
 *
 * Handles git operations for task execution:
 * - Branch creation
 * - Committing changes
 * - Creating PRs via gh CLI
 */

import { execa } from "execa";
import { SessionManager } from "./session-manager";
import { EventLevel, EventType } from "@nightshift/shared";

export interface CommitResult {
  success: boolean;
  commitSha?: string;
  error?: string;
}

export interface PushResult {
  success: boolean;
  error?: string;
}

export interface PrResult {
  success: boolean;
  prUrl?: string;
  error?: string;
}

export class GitOperations {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Check if there are changes to commit
   */
  async hasChanges(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await execa("git", ["status", "--porcelain"], {
        cwd: repoPath,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if working tree is clean (no uncommitted changes or untracked files)
   * Required for direct mode workflow execution
   */
  async isWorkingTreeClean(repoPath: string): Promise<boolean> {
    return !(await this.hasChanges(repoPath));
  }

  /**
   * Stage all changes and commit
   */
  async commit(repoPath: string, message: string): Promise<CommitResult> {
    try {
      // Stage all changes
      await execa("git", ["add", "-A"], { cwd: repoPath });

      // SECURITY FIX: Use array-based syntax to prevent shell injection
      // Message is passed as a separate argument, not interpolated into shell command
      await execa("git", ["commit", "-m", message], {
        cwd: repoPath,
      });

      // Get commit SHA
      const { stdout: sha } = await execa("git", ["rev-parse", "HEAD"], {
        cwd: repoPath,
      });
      const commitSha = sha.trim();

      // Get list of files in commit
      const { stdout: files } = await execa(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
        {
          cwd: repoPath,
        },
      );

      this.sessionManager.emit(EventType.ARTIFACT_COMMIT_CREATED, EventLevel.INFO, {
        sha: commitSha,
        message,
        files: files.trim().split("\n").filter(Boolean),
      });

      return { success: true, commitSha };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Commit failed";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Push branch to remote
   */
  async push(repoPath: string, branchName: string): Promise<PushResult> {
    try {
      await execa("git", ["push", "-u", "origin", branchName], { cwd: repoPath });
      return { success: true };
    } catch (error) {
      // Extract detailed error message for better debugging
      let errorMessage = "Push failed";
      if (error instanceof Error) {
        const execaError = error as Error & { stderr?: string; exitCode?: number };
        // Prefer stderr as it contains the actual git error
        if (execaError.stderr) {
          errorMessage = execaError.stderr;
        } else {
          errorMessage = error.message;
        }

        // Provide helpful hints for common errors
        if (errorMessage.includes("Permission denied") || errorMessage.includes("permission")) {
          errorMessage += "\n\nHint: Check your Git credentials. Run 'gh auth status' to verify GitHub CLI authentication, or check your SSH keys with 'ssh -T git@github.com'.";
        } else if (errorMessage.includes("remote: Write access") || errorMessage.includes("403")) {
          errorMessage += "\n\nHint: Your token may lack write permissions. Ensure your GitHub token has 'repo' scope or the repository is included in fine-grained token settings.";
        } else if (
          errorMessage.includes("protected branch") ||
          errorMessage.includes("branch protection")
        ) {
          errorMessage += "\n\nHint: This branch has protection rules. Push to a feature branch instead.";
        }
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if gh CLI is available and authenticated
   * Returns detailed status information for better error messages
   */
  async getGhAuthStatus(): Promise<{ available: boolean; error?: string }> {
    try {
      const result = await execa("gh", ["auth", "status"], { reject: false });
      if (result.exitCode === 0) {
        return { available: true };
      }
      // gh auth status returns non-zero if not authenticated
      return {
        available: false,
        error: result.stderr || "GitHub CLI is not authenticated. Run 'gh auth login' to authenticate.",
      };
    } catch (error) {
      return {
        available: false,
        error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/",
      };
    }
  }

  /**
   * Check if gh CLI is available and authenticated
   * @deprecated Use getGhAuthStatus() for detailed error information
   */
  async isGhAvailable(): Promise<boolean> {
    const status = await this.getGhAuthStatus();
    return status.available;
  }

  /**
   * Get the default branch for a repository
   */
  async getDefaultBranch(repoPath: string): Promise<string> {
    try {
      // Try to get from remote HEAD reference
      const { stdout } = await execa(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
        { cwd: repoPath },
      );
      return stdout.trim().replace("origin/", "");
    } catch {
      // Try to get from gh api if symbolic-ref fails
      try {
        const { stdout } = await execa("gh", ["repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"], {
          cwd: repoPath,
        });
        const branch = stdout.trim();
        if (branch) return branch;
      } catch {
        // Ignore gh errors
      }
      // Fallback to main
      return "main";
    }
  }

  /**
   * Create a pull request using gh CLI
   */
  async createPr(
    repoPath: string,
    title: string,
    body: string,
    baseBranch?: string,
  ): Promise<PrResult> {
    try {
      // Check if gh is available with detailed status
      const ghStatus = await this.getGhAuthStatus();
      if (!ghStatus.available) {
        return {
          success: false,
          error: ghStatus.error || "gh CLI not configured or not authenticated",
        };
      }

      // Get default branch if not specified
      if (!baseBranch) {
        baseBranch = await this.getDefaultBranch(repoPath);
      }

      // SECURITY FIX: Use array-based syntax to prevent shell injection
      // Title, body, and baseBranch are passed as separate arguments
      const result = await execa(
        "gh",
        ["pr", "create", "--title", title, "--body", body, "--base", baseBranch],
        { cwd: repoPath, reject: false },
      );

      if (result.exitCode !== 0) {
        let errorMessage = result.stderr || "PR creation failed";

        // Provide helpful hints for common errors
        if (
          errorMessage.includes("permission") ||
          errorMessage.includes("Permission") ||
          errorMessage.includes("403")
        ) {
          errorMessage += "\n\nHint: This error often means the branch hasn't been pushed yet, or your GitHub token lacks write permissions. Try running 'git push -u origin HEAD' first.";
        } else if (errorMessage.includes("already exists")) {
          errorMessage += "\n\nHint: A PR for this branch already exists. Check the repository's pull requests.";
        } else if (errorMessage.includes("No commits")) {
          errorMessage += "\n\nHint: The branch has no new commits compared to the base branch.";
        }

        return { success: false, error: errorMessage };
      }

      const prUrl = result.stdout.trim();

      this.sessionManager.emit(EventType.ARTIFACT_PR_CREATED, EventLevel.INFO, {
        url: prUrl,
        title,
        baseBranch,
      });

      return { success: true, prUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "PR creation failed";
      return { success: false, error: errorMessage };
    }
  }
}
