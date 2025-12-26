/**
 * Direct Mode Manager
 *
 * Manages direct execution mode for large repositories.
 * Runs tasks directly in the original repo without creating worktrees.
 * Only one task can run at a time in direct mode.
 */

import {
  type DiffStats,
  branchExists,
  checkout,
  checkoutNewBranch,
  commitAll,
  deleteBranch,
  getCurrentBranch,
  getDiffFromBase,
  getHeadSha,
  isRepoDirty,
} from "./git";

/**
 * SECURITY: Validate taskId to prevent path traversal and command injection
 * Git ref names must not contain: /../, shell metacharacters, control characters
 */
function validateTaskId(taskId: string): void {
  // Check for path traversal
  if (taskId.includes("../") || taskId.includes("/..") || taskId.includes("..")) {
    throw new Error(`Invalid taskId: contains path traversal (..)`);
  }

  // Check for shell metacharacters that could break commands
  const dangerousChars = /[;&|`$(){}[\]<>'"\\!\s]/;
  if (dangerousChars.test(taskId)) {
    throw new Error(`Invalid taskId: contains shell metacharacters`);
  }

  // Check for invalid git ref characters (per git-check-ref-format)
  // Cannot start with ., cannot contain .., cannot end with .lock, etc.
  if (taskId.startsWith(".") || taskId.includes("..") || taskId.endsWith(".lock")) {
    throw new Error(`Invalid taskId: violates git ref format rules`);
  }

  // Cannot contain control characters
  if (/[\x00-\x1f\x7f]/.test(taskId)) {
    throw new Error(`Invalid taskId: contains control characters`);
  }

  // Must not be empty
  if (!taskId || taskId.trim().length === 0) {
    throw new Error(`Invalid taskId: cannot be empty`);
  }
}

/**
 * Information about a direct mode setup
 */
export interface DirectModeSetup {
  /** Branch that was checked out before task started */
  originalBranch: string;
  /** Branch created for the task */
  taskBranch: string;
  /** SHA of the commit when task started (for diffs) */
  baseCommitSha: string;
  /** Working directory (same as repoPath in direct mode) */
  workDir: string;
}

/**
 * Error codes for direct mode operations
 */
export const DirectModeError = {
  REPO_DIRTY: "NEEDS_HUMAN_GIT_DIRTY",
  BRANCH_EXISTS: "DIRECT_MODE_BRANCH_EXISTS",
  CHECKOUT_FAILED: "DIRECT_MODE_CHECKOUT_FAILED",
} as const;

/**
 * Result of a direct mode operation
 */
export interface DirectModeResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Manages direct execution mode for large repositories
 */
export class DirectModeManager {
  /**
   * Generate the branch name for a task
   */
  getBranchName(taskId: string): string {
    // SECURITY FIX: Validate taskId before using in branch name
    validateTaskId(taskId);
    return `nightshift/${taskId}`;
  }

  /**
   * Set up direct mode execution for a task
   *
   * 1. Records current branch
   * 2. Gets HEAD SHA for diffing
   * 3. Creates and checks out task branch
   *
   * Note: Dirty check is handled by PreflightChecker after setup completes
   */
  async setup(taskId: string, repoPath: string): Promise<DirectModeResult<DirectModeSetup>> {
    // Step 1: Get current branch
    const originalBranch = await getCurrentBranch(repoPath);

    // Step 2: Get HEAD SHA for diffing
    const baseCommitSha = await getHeadSha(repoPath);

    // Step 3: Create task branch
    const taskBranch = this.getBranchName(taskId);

    // Check if branch already exists (resume scenario)
    const exists = await branchExists(taskBranch, repoPath);
    if (exists) {
      // Resume: checkout existing branch
      try {
        await checkout(taskBranch, repoPath);
        console.log(`[DirectMode] Resumed existing branch ${taskBranch}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Checkout failed";
        return {
          success: false,
          error: {
            code: DirectModeError.CHECKOUT_FAILED,
            message: `Failed to checkout branch ${taskBranch}: ${message}`,
          },
        };
      }
    } else {
      // New: create and checkout new branch
      try {
        await checkoutNewBranch(taskBranch, repoPath);
        console.log(`[DirectMode] Created and checked out branch ${taskBranch}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Branch creation failed";
        return {
          success: false,
          error: {
            code: DirectModeError.CHECKOUT_FAILED,
            message: `Failed to create branch ${taskBranch}: ${message}`,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        originalBranch,
        taskBranch,
        baseCommitSha,
        workDir: repoPath,
      },
    };
  }

  /**
   * Tear down direct mode (return to original branch)
   *
   * @param repoPath - Path to the repository
   * @param originalBranch - Branch to return to
   * @param deleteBranchAfter - Whether to delete the task branch
   */
  async teardown(
    repoPath: string,
    originalBranch: string,
    deleteBranchAfter = false,
  ): Promise<void> {
    const currentBranch = await getCurrentBranch(repoPath);

    // Return to original branch
    if (currentBranch !== originalBranch) {
      try {
        await checkout(originalBranch, repoPath);
        console.log(`[DirectMode] Returned to branch ${originalBranch}`);
      } catch (error) {
        console.error(`[DirectMode] Failed to checkout ${originalBranch}:`, error);
        // Continue with cleanup
      }
    }

    // Optionally delete task branch
    if (deleteBranchAfter && currentBranch.startsWith("nightshift/")) {
      try {
        await deleteBranch(currentBranch, repoPath);
        console.log(`[DirectMode] Deleted branch ${currentBranch}`);
      } catch {
        // Ignore delete failures
      }
    }
  }

  /**
   * Prepare for pause in direct mode
   *
   * Commits all changes but stays on task branch.
   */
  async prepareForPause(repoPath: string, commitMessage: string): Promise<string | null> {
    const dirty = await isRepoDirty(repoPath);
    if (!dirty) {
      return null; // No changes to commit
    }

    try {
      const sha = await commitAll(commitMessage, repoPath);
      console.log(`[DirectMode] Committed WIP: ${sha.substring(0, 8)}`);
      return sha;
    } catch (error) {
      console.error("[DirectMode] Failed to commit changes:", error);
      return null;
    }
  }

  /**
   * Prepare for resume in direct mode
   *
   * Checks that task branch exists and switches to it.
   *
   * Note: Dirty check is handled by PreflightChecker after resume setup completes
   */
  async prepareForResume(
    taskId: string,
    repoPath: string,
  ): Promise<DirectModeResult<DirectModeSetup>> {
    const taskBranch = this.getBranchName(taskId);

    // Check task branch exists
    const exists = await branchExists(taskBranch, repoPath);
    if (!exists) {
      return {
        success: false,
        error: {
          code: "BRANCH_NOT_FOUND",
          message: `Task branch ${taskBranch} not found. The task may have been cleaned up.`,
        },
      };
    }

    // Get current branch before switching
    const originalBranch = await getCurrentBranch(repoPath);

    // Switch to task branch
    try {
      await checkout(taskBranch, repoPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed";
      return {
        success: false,
        error: {
          code: DirectModeError.CHECKOUT_FAILED,
          message: `Failed to checkout branch ${taskBranch}: ${message}`,
        },
      };
    }

    // Get base commit (first commit on this branch that differs from main)
    const baseCommitSha = await getHeadSha(repoPath);

    return {
      success: true,
      data: {
        originalBranch,
        taskBranch,
        baseCommitSha,
        workDir: repoPath,
      },
    };
  }

  /**
   * Check if the repo is ready for direct mode execution
   */
  async isRepoReady(repoPath: string): Promise<DirectModeResult<void>> {
    const dirty = await isRepoDirty(repoPath);
    if (dirty) {
      return {
        success: false,
        error: {
          code: DirectModeError.REPO_DIRTY,
          message:
            "Repository has uncommitted changes. Please commit or stash your changes before running a task.",
        },
      };
    }

    return { success: true };
  }

  /**
   * Get diff statistics for a direct mode task
   */
  async getDiff(repoPath: string, baseSha: string): Promise<DiffStats> {
    return getDiffFromBase(repoPath, baseSha);
  }
}

// Default singleton instance
export const directModeManager = new DirectModeManager();
