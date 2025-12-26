/**
 * Task Lifecycle
 *
 * Handles task state transitions including pause and resume.
 * Coordinates with task-setup for environment management.
 */

import type { Task } from "@nightshift/shared";
import type { PauseReason } from "@nightshift/shared";
import { EventLevel, EventType, TaskState } from "@nightshift/shared";
import { getTaskById, updateTask } from "../tasks/repository";
import { type TaskSetupResult, resumeTaskExecution, teardownTaskExecution } from "./task-setup";
import { SessionManager } from "./session-manager";

/**
 * Result of a lifecycle operation
 */
export interface LifecycleResult {
  success: boolean;
  task?: Task;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Pause a running task
 *
 * 1. Validates task is in RUNNING state
 * 2. Commits WIP changes
 * 3. Removes worktree (or stays on branch for direct mode)
 * 4. Updates task status to PAUSED
 *
 * @param taskId - Task to pause
 * @param reason - Why the task is being paused
 * @param question - Question for user (if needs_human)
 * @param sessionManager - Session manager for logging events
 */
export async function pauseTask(
  taskId: string,
  reason: PauseReason,
  question?: string,
  sessionManager?: SessionManager,
): Promise<LifecycleResult> {
  const task = getTaskById(taskId);

  if (!task) {
    return {
      success: false,
      error: {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found`,
      },
    };
  }

  // Validate state
  if (task.status !== TaskState.RUNNING) {
    return {
      success: false,
      error: {
        code: "INVALID_STATE",
        message: `Cannot pause task in ${task.status} state (must be RUNNING)`,
      },
    };
  }

  // Generate WIP commit message
  const commitMessage = generateWipCommitMessage(task, reason);

  // Tear down execution environment (commits WIP, removes worktree if applicable)
  try {
    await teardownTaskExecution(task, "paused", commitMessage);
  } catch (error) {
    console.error(`[TaskLifecycle] Failed to tear down task ${taskId}:`, error);
    // Continue with pause even if teardown fails
  }

  // Update task status
  const now = new Date().toISOString();
  const updatedTask = updateTask(taskId, {
    status: TaskState.PAUSED,
    pausedAt: now,
    pauseReason: reason,
    humanQuestion: question,
  });

  // Log event
  if (sessionManager) {
    sessionManager.emit(EventType.TASK_PAUSED, EventLevel.INFO, {
      taskId,
      reason,
      question,
      pausedAt: now,
    });
  }

  console.log(`[TaskLifecycle] Task ${taskId} paused (reason: ${reason})`);

  return {
    success: true,
    task: updatedTask || undefined,
  };
}

/**
 * Resume a paused task
 *
 * 1. Validates task is in PAUSED state
 * 2. Recreates execution environment (worktree or branch checkout)
 * 3. Updates task status to RUNNING
 * 4. Returns setup result for executor to continue
 *
 * @param taskId - Task to resume
 * @param humanResponse - User's response to continue (if was needs_human)
 * @param sessionManager - Session manager for logging events
 */
export async function resumeTask(
  taskId: string,
  humanResponse?: string,
  sessionManager?: SessionManager,
): Promise<
  | { success: true; task: Task; setup: TaskSetupResult }
  | { success: false; error: { code: string; message: string } }
> {
  const task = getTaskById(taskId);

  if (!task) {
    return {
      success: false,
      error: {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found`,
      },
    };
  }

  // Validate state - can resume from PAUSED or legacy NEEDS_HUMAN
  if (task.status !== TaskState.PAUSED && task.status !== TaskState.NEEDS_HUMAN) {
    return {
      success: false,
      error: {
        code: "INVALID_STATE",
        message: `Cannot resume task in ${task.status} state (must be PAUSED or NEEDS_HUMAN)`,
      },
    };
  }

  // Resume execution environment
  const setupResult = await resumeTaskExecution(task);

  if (!setupResult.success) {
    return {
      success: false,
      error: setupResult.error,
    };
  }

  // Update task status
  const updatedTask = updateTask(taskId, {
    status: TaskState.RUNNING,
    pausedAt: undefined,
    pauseReason: undefined,
    humanResponse: humanResponse,
  });

  // Log event
  if (sessionManager) {
    sessionManager.emit(EventType.TASK_RESUMED, EventLevel.INFO, {
      taskId,
      humanResponse: humanResponse ? "[provided]" : undefined,
      workDir: setupResult.data.workDir,
    });
  }

  console.log(`[TaskLifecycle] Task ${taskId} resumed`);

  return {
    success: true,
    task: updatedTask!,
    setup: setupResult.data,
  };
}

/**
 * Build a resume prompt that includes context and human response
 *
 * @param task - The task being resumed
 * @param originalPrompt - The original task prompt
 */
export function buildResumePrompt(task: Task, originalPrompt: string): string {
  const parts: string[] = [];

  // Add context about the pause
  if (task.pauseReason === "needs_human" && task.humanQuestion) {
    parts.push(`[CONTEXT: This task was previously paused because clarification was needed.]`);
    parts.push(`[QUESTION ASKED: ${task.humanQuestion}]`);
  } else if (task.pauseReason === "rate_limit") {
    parts.push(
      `[CONTEXT: This task was previously paused due to rate limiting. Execution is now resuming.]`,
    );
  } else if (task.pauseReason === "manual") {
    parts.push(`[CONTEXT: This task was manually paused and is now resuming.]`);
  }

  // Add human response if provided
  if (task.humanResponse) {
    parts.push(`[HUMAN CLARIFICATION: ${task.humanResponse}]`);
  }

  // Add instruction to continue
  parts.push(`[INSTRUCTION: Continue with the original task. Pick up where you left off.]`);

  // Add original prompt
  parts.push("");
  parts.push(`[ORIGINAL TASK:]`);
  parts.push(originalPrompt);

  return parts.join("\n");
}

/**
 * Generate a WIP commit message
 */
function generateWipCommitMessage(task: Task, reason: PauseReason): string {
  const reasonText = {
    manual: "manually paused",
    needs_human: "waiting for human input",
    rate_limit: "rate limited",
  }[reason];

  return `WIP: Task ${task.id} - ${reasonText}

Task prompt: ${task.prompt.substring(0, 100)}${task.prompt.length > 100 ? "..." : ""}

This commit was automatically created when the task was paused.
Resume the task to continue work.`;
}

