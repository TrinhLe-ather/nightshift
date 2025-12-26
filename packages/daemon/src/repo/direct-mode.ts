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
  if (/[\x00-\x1F\x7F]/.test(taskId)) {
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
const DirectModeError = {
  REPO_DIRTY: "NEEDS_HUMAN_GIT_DIRTY",
  BRANCH_EXISTS: "DIRECT_MODE_BRANCH_EXISTS",
  CHECKOUT_FAILED: "DIRECT_MODE_CHECKOUT_FAILED",
} as const;

/**
 * Result of a direct mode operation
 */
interface DirectModeResult<T> {
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
   * For interactive tasks:
   * - Stays on current branch (no branch switching)
   * - Uses current HEAD for diffing
   * - Sets taskBranch to current branch name
   *
   * For workflow tasks:
   * - Records current branch
   * - Gets HEAD SHA for diffing
   * - Creates and checks out task branch
   *
   * Note: Dirty check is handled by PreflightChecker after setup completes
   */
  async setup(
    taskId: string,
    repoPath: string,
    taskType: "interactive" | "workflow" = "interactive",
  ): Promise<DirectModeResult<DirectModeSetup>> {
    // Step 1: Get current branch
    const originalBranch = await getCurrentBranch(repoPath);

    // Step 2: Get HEAD SHA for diffing
    const baseCommitSha = await getHeadSha(repoPath);

    // Step 3: Handle branch management based on task type
    let taskBranch: string;

    if (taskType === "interactive") {
      // Interactive: Stay on current branch
      taskBranch = originalBranch;
      console.log(`[DirectMode] Interactive task: staying on branch ${originalBranch}`);
    } else {
      // Workflow: Create task-specific branch
      taskBranch = this.getBranchName(taskId);

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
   * For interactive tasks: No-op (stays on current branch)
   * For workflow tasks: Returns to original branch and optionally deletes task branch
   *
   * @param repoPath - Path to the repository
   * @param originalBranch - Branch to return to
   * @param deleteBranchAfter - Whether to delete the task branch
   * @param taskType - Type of task (interactive or workflow)
   */
  async teardown(
    repoPath: string,
    originalBranch: string,
    deleteBranchAfter = false,
    taskType: "interactive" | "workflow" = "interactive",
  ): Promise<void> {
    // Interactive tasks: stay on current branch
    if (taskType === "interactive") {
      console.log(`[DirectMode] Interactive task: staying on current branch`);
      return;
    }

    // Workflow tasks: return to original branch
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
   * For interactive tasks: Stays on current branch
   * For workflow tasks: Checks that task branch exists and switches to it
   *
   * Note: Dirty check is handled by PreflightChecker after resume setup completes
   */
  async prepareForResume(
    taskId: string,
    repoPath: string,
  ): Promise<DirectModeResult<DirectModeSetup>> {
    // Get current branch
    const currentBranch = await getCurrentBranch(repoPath);
    const baseCommitSha = await getHeadSha(repoPath);

    const taskBranch = this.getBranchName(taskId);
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

    // Get current branch before switching (for originalBranch)
    const originalBranch = currentBranch;

    // Switch to task branch
    try {
      await checkout(taskBranch, repoPath);
      console.log(`[DirectMode] Resumed workflow task on branch ${taskBranch}`);
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
   * Get diff statistics for a direct mode task
   */
  async getDiff(repoPath: string, baseSha: string): Promise<DiffStats> {
    return getDiffFromBase(repoPath, baseSha);
  }
}
