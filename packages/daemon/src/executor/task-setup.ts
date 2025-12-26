/**
 * Task Setup
 *
 * Handles task execution environment setup and teardown.
 * Supports both worktree mode (parallel execution) and direct mode (large repos).
 */

import type { Repo, Task } from "@nightshift/shared";

import {
  DirectModeManager,
  type DirectModeSetup,
  type WorktreeInfo,
  WorktreeManager,
  detectExecutionMode,
} from "../repo";
import { getRepoById } from "../tasks/repos";
import { updateTask } from "../tasks/repository";

import type { ExecutionMode } from "../repo";

/**
 * Result of task execution setup
 */
export interface TaskSetupResult {
  /** Resolved execution mode */
  executionMode: ExecutionMode;
  /** Working directory for Claude (worktree path or repo path) */
  workDir: string;
  /** SHA of commit when task started (for diffs) */
  baseCommitSha: string;
  /** Branch created for the task */
  taskBranch: string;
  /** Original branch before task (direct mode only) */
  originalBranch?: string;
  /** Path to the source repository */
  repoPath: string;
}

/**
 * Options for task setup
 */
export interface TaskSetupOptions {
  /** Task to set up */
  task: Task;
  /** Repository configuration (optional, will be fetched if not provided) */
  repo?: Repo;
}

/**
 * Error result for setup failures
 */
export interface TaskSetupError {
  code: string;
  message: string;
}

/**
 * Set up the execution environment for a task
 *
 * This function:
 * 1. Determines execution mode (worktree or direct)
 * 2. Creates worktree OR sets up direct mode
 * 3. Updates task with execution details
 * 4. Returns setup result for executor
 */
export async function setupTaskExecution(
  options: TaskSetupOptions,
): Promise<{ success: true; data: TaskSetupResult } | { success: false; error: TaskSetupError }> {
  const { task } = options;

  // Get repo if not provided
  let repo = options.repo;
  if (!repo && task.repoId) {
    repo = getRepoById(task.repoId) ?? undefined;
  }

  // If no repo, use current working directory
  const repoPath = task.repoPath || repo?.path || process.cwd();

  // Determine execution mode: task-level override takes precedence over repo config
  let executionMode: "worktree" | "direct";
  let modeReason: string;

  if (task.executionMode) {
    // Task has explicit execution mode override
    executionMode = task.executionMode;
    modeReason = "task-level override";
    console.log(`[TaskSetup] Task ${task.id}: Using ${executionMode} mode (${modeReason})`);
  } else {
    // Fall back to repo config + auto-detection
    const repoExecutionModeConfig = repo?.executionMode || "auto";
    const modeResult = await detectExecutionMode(repoPath, repoExecutionModeConfig);
    executionMode = modeResult.mode;
    modeReason = modeResult.reason;
    console.log(`[TaskSetup] Task ${task.id}: Using ${executionMode} mode (${modeReason})`);
  }

  let result: TaskSetupResult;

  if (executionMode === "worktree") {
    // Worktree mode: create isolated environment
    const setupResult = await setupWorktreeMode(task.id, repoPath);
    if (!setupResult.success) {
      return setupResult;
    }
    result = {
      executionMode: "worktree",
      workDir: setupResult.data.path,
      baseCommitSha: setupResult.data.baseCommitSha,
      taskBranch: setupResult.data.branch,
      repoPath,
    };
  } else {
    // Direct mode: run in original repo
    const setupResult = await setupDirectMode(task.id, repoPath);
    if (!setupResult.success) {
      return setupResult;
    }
    result = {
      executionMode: "direct",
      workDir: setupResult.data.workDir,
      baseCommitSha: setupResult.data.baseCommitSha,
      taskBranch: setupResult.data.taskBranch,
      originalBranch: setupResult.data.originalBranch,
      repoPath,
    };
  }

  // Update task with execution details
  updateTask(task.id, {
    executionMode: result.executionMode,
    workDir: result.workDir,
    baseCommitSha: result.baseCommitSha,
    branch: result.taskBranch,
    originalBranch: result.originalBranch,
  });

  return { success: true, data: result };
}

/**
 * Set up worktree mode execution
 */
async function setupWorktreeMode(
  taskId: string,
  repoPath: string,
): Promise<{ success: true; data: WorktreeInfo } | { success: false; error: TaskSetupError }> {
  const worktreeManager = new WorktreeManager();

  try {
    const info = await worktreeManager.create({
      taskId,
      repoPath,
    });

    return { success: true, data: info };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create worktree";
    console.error(`[TaskSetup] Worktree creation failed:`, error);
    return {
      success: false,
      error: {
        code: "WORKTREE_CREATION_FAILED",
        message,
      },
    };
  }
}

/**
 * Set up direct mode execution
 */
async function setupDirectMode(
  taskId: string,
  repoPath: string,
): Promise<{ success: true; data: DirectModeSetup } | { success: false; error: TaskSetupError }> {
  const directModeManager = new DirectModeManager();

  const result = await directModeManager.setup(taskId, repoPath);

  if (!result.success) {
    return {
      success: false,
      error: result.error!,
    };
  }

  return { success: true, data: result.data! };
}

/**
 * Tear down the execution environment after task completion
 *
 * DEFENSIVE: This function catches and logs teardown errors but does not throw them.
 * Teardown failures should not cause task state transitions - if task completed successfully,
 * it should stay COMPLETED even if cleanup fails. Errors are logged and saved to metadata.
 *
 * @param task - The completed task
 * @param outcome - How the task ended
 * @param commitMessage - Optional commit message for WIP commit on pause
 * @param deleteBranch - Optional: delete the branch after cleanup (worktree mode only)
 * @returns Object with success status and optional error message
 */
export async function teardownTaskExecution(
  task: Task,
  outcome: "completed" | "failed" | "paused",
  commitMessage?: string,
  deleteBranch = false,
): Promise<{ success: boolean; error?: string }> {
  if (!task.executionMode || !task.workDir) {
    console.log("[TaskSetup] No execution environment to tear down");
    return { success: true };
  }

  const repoPath = task.repoPath || process.cwd();

  try {
    if (task.executionMode === "worktree") {
      await teardownWorktreeMode(task, outcome, repoPath, commitMessage, deleteBranch);
    } else {
      await teardownDirectMode(task, outcome, repoPath, commitMessage);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown teardown error";
    console.error(`[TaskSetup] Teardown failed for task ${task.id}:`, error);
    // TODO: Save teardown error to task metadata for debugging
    // For now, just log and return error but don't throw
    return { success: false, error: message };
  }
}

/**
 * Tear down worktree mode
 */
async function teardownWorktreeMode(
  task: Task,
  outcome: "completed" | "failed" | "paused",
  repoPath: string,
  commitMessage?: string,
  deleteBranch = false,
): Promise<void> {
  const worktreeManager = new WorktreeManager();
  const worktreePath = task.workDir!;

  switch (outcome) {
    case "completed":
      // Completed: PR already created, remove worktree (optionally delete branch)
      await worktreeManager.remove(worktreePath, repoPath, undefined, deleteBranch);
      console.log(
        `[TaskSetup] Removed worktree after completion: ${worktreePath}${deleteBranch ? " (branch deleted)" : ""}`,
      );
      break;

    case "paused": {
      // Paused: commit WIP changes, remove worktree (keep branch for resume)
      const wipMessage = commitMessage || `WIP: Task ${task.id} paused`;
      await worktreeManager.remove(worktreePath, repoPath, wipMessage, false); // Never delete branch on pause
      console.log(`[TaskSetup] Paused worktree (committed WIP): ${worktreePath}`);
      break;
    }

    case "failed":
      // Failed: optionally preserve for debugging, remove the worktree (optionally delete branch)
      await worktreeManager.remove(worktreePath, repoPath, undefined, deleteBranch);
      console.log(
        `[TaskSetup] Removed worktree after failure: ${worktreePath}${deleteBranch ? " (branch deleted)" : ""}`,
      );
      break;
  }
}

/**
 * Tear down direct mode
 */
async function teardownDirectMode(
  task: Task,
  outcome: "completed" | "failed" | "paused",
  repoPath: string,
  commitMessage?: string,
): Promise<void> {
  const directModeManager = new DirectModeManager();
  const taskType = (task as { type?: "interactive" | "workflow" }).type || "interactive";

  switch (outcome) {
    case "completed":
      // Completed: return to original branch (workflow) or stay (interactive)
      if (task.originalBranch) {
        await directModeManager.teardown(repoPath, task.originalBranch, false, taskType);
      }
      console.log(
        `[TaskSetup] Direct mode completed${taskType === "interactive" ? " (staying on current branch)" : `, returned to ${task.originalBranch}`}`,
      );
      break;

    case "paused": {
      // Paused: commit WIP, stay on task branch
      const wipMessage = commitMessage || `WIP: Task ${task.id} paused`;
      await directModeManager.prepareForPause(repoPath, wipMessage);
      // Don't switch branches - user will resume on this branch
      console.log(`[TaskSetup] Direct mode paused (committed WIP)`);
      break;
    }

    case "failed":
      // Failed: return to original branch (workflow) or stay (interactive)
      if (task.originalBranch) {
        await directModeManager.teardown(repoPath, task.originalBranch, false, taskType);
      }
      console.log(
        `[TaskSetup] Direct mode failed${taskType === "interactive" ? " (staying on current branch)" : `, returned to ${task.originalBranch}`}`,
      );
      break;
  }
}

/**
 * Resume a paused task
 *
 * Recreates the execution environment for a paused task.
 */
export async function resumeTaskExecution(
  task: Task,
): Promise<{ success: true; data: TaskSetupResult } | { success: false; error: TaskSetupError }> {
  if (!task.executionMode) {
    return {
      success: false,
      error: {
        code: "NO_EXECUTION_MODE",
        message: "Task has no execution mode set - cannot resume",
      },
    };
  }

  const repoPath = task.repoPath || process.cwd();

  if (task.executionMode === "worktree") {
    // Worktree mode: recreate worktree from existing branch
    const worktreeManager = new WorktreeManager();

    try {
      const info = await worktreeManager.create({
        taskId: task.id,
        repoPath,
        // Branch already exists, will be reused
      });

      // Update task with new workDir
      updateTask(task.id, {
        workDir: info.path,
      });

      return {
        success: true,
        data: {
          executionMode: "worktree",
          workDir: info.path,
          baseCommitSha: task.baseCommitSha || info.baseCommitSha,
          taskBranch: info.branch,
          repoPath,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resume worktree";
      return {
        success: false,
        error: {
          code: "WORKTREE_RESUME_FAILED",
          message,
        },
      };
    }
  } else {
    // Direct mode: checkout task branch (or stay on current for interactive)
    const directModeManager = new DirectModeManager();

    const result = await directModeManager.prepareForResume(task.id, repoPath);

    if (!result.success) {
      return {
        success: false,
        error: result.error!,
      };
    }

    // Update task with workDir
    updateTask(task.id, {
      workDir: result.data!.workDir,
    });

    return {
      success: true,
      data: {
        executionMode: "direct",
        workDir: result.data!.workDir,
        baseCommitSha: task.baseCommitSha || result.data!.baseCommitSha,
        taskBranch: result.data!.taskBranch,
        originalBranch: result.data!.originalBranch,
        repoPath,
      },
    };
  }
}
