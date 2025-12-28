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
}
