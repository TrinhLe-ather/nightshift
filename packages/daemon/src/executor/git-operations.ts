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

export interface PrResult {
  success: boolean;
  prUrl?: string;
  error?: string;
}

export class GitOperations {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Create a branch for the task
   */
  async createBranch(repoPath: string, taskId: string): Promise<string> {
    const branchName = `nightshift/${taskId}`;

    try {
      // Get current branch to return to if needed
      const { stdout: currentBranch } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repoPath,
      });

      // Create and checkout new branch
      await execa("git", ["checkout", "-b", branchName], { cwd: repoPath });

      this.sessionManager.emit(EventType.REPO_BRANCH_CREATED, EventLevel.INFO, {
        branch: branchName,
        fromBranch: currentBranch.trim(),
      });

      return branchName;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create branch";
      throw new Error(`Failed to create branch ${branchName}: ${message}`);
    }
  }

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
   * Get list of modified files
   */
  async getModifiedFiles(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await execa("git", ["status", "--porcelain"], {
        cwd: repoPath,
      });
      const files = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => line.substring(3)); // Remove status prefix

      return files;
    } catch {
      return [];
    }
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
  async push(repoPath: string, branchName: string): Promise<boolean> {
    try {
      await execa("git", ["push", "-u", "origin", branchName], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  async isGhAvailable(): Promise<boolean> {
    try {
      await execa("gh", ["auth", "status"]);
      return true;
    } catch {
      return false;
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
      // Check if gh is available
      const ghAvailable = await this.isGhAvailable();
      if (!ghAvailable) {
        return {
          success: false,
          error: "gh CLI not configured or not authenticated",
        };
      }

      // Get default branch if not specified
      if (!baseBranch) {
        try {
          const { stdout } = await execa(
            "git",
            ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
            { cwd: repoPath },
          );
          baseBranch = stdout.trim().replace("origin/", "");
        } catch {
          // Fallback to main if symbolic-ref fails
          baseBranch = "main";
        }
      }

      // SECURITY FIX: Use array-based syntax to prevent shell injection
      // Title, body, and baseBranch are passed as separate arguments
      const { stdout } = await execa(
        "gh",
        ["pr", "create", "--title", title, "--body", body, "--base", baseBranch],
        { cwd: repoPath },
      );

      const prUrl = stdout.trim();

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

  /**
   * Checkout a specific branch
   */
  async checkout(repoPath: string, branch: string): Promise<void> {
    await execa("git", ["checkout", branch], { cwd: repoPath });

    this.sessionManager.emit(EventType.REPO_CHECKOUT, EventLevel.INFO, {
      branch,
    });
  }

  /**
   * Pull latest changes
   */
  async pull(repoPath: string): Promise<boolean> {
    try {
      await execa("git", ["pull"], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }
}
