/**
 * Task Executor
 *
 * Main orchestrator for task execution.
 * Supports dual execution modes (worktree for parallel, direct for large repos).
 * Polls queue, claims tasks, sets up execution environment, runs Claude,
 * handles git operations, and manages task lifecycle.
 */

import * as path from "node:path";
import * as os from "node:os";
import { SessionManager, setSessionManager } from "./session-manager";
import { PreflightChecker } from "./preflight-checker";
import { GitOperations } from "./git-operations";
import { SdkRunner, type SdkRunResult, type SdkMessage } from "./sdk";
import { RepoLockManager } from "./repo-lock-manager";
import { type TaskSetupResult, setupTaskExecution, teardownTaskExecution } from "./task-setup";
import { buildResumePrompt, pauseTask } from "./task-lifecycle";
import { generateAndStoreTaskName } from "./task-name-generator";
import { claimNextPendingTask, getTaskById, getTasks, updateTask } from "../tasks/repository";
import { EventLevel, EventType, TaskState } from "@nightshift/shared";
import type { Task } from "@nightshift/shared";
import { WorkflowExecutor } from "./workflow-executor";

const DEFAULT_POLL_INTERVAL_MS = 5000; // 5 seconds
const DEFAULT_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_MAX_CONCURRENT_TASKS = 3;

export interface ExecutorConfig {
  dataDir: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxConcurrentTasks?: number;
}

export class TaskExecutor {
  private dataDir: string;
  private pollIntervalMs: number;
  private timeoutMs: number;
  private maxConcurrentTasks: number;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  // Track multiple concurrent tasks (enabled by worktree mode)
  private runningTasks: Map<string, { task: Task; setup: TaskSetupResult }> = new Map();

  private sessionManager: SessionManager;
  private preflightChecker: PreflightChecker;
  private gitOperations: GitOperations;
  private repoLockManager: RepoLockManager;

  // Track current SDK runners for terminal preview access
  private currentSdkRunners: Map<string, SdkRunner> = new Map();

  constructor(config: ExecutorConfig) {
    this.dataDir = config.dataDir;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxConcurrentTasks = config.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;

    // Initialize components
    this.sessionManager = new SessionManager(this.dataDir);
    // Set as global instance for oRPC contracts
    setSessionManager(this.sessionManager);
    this.preflightChecker = new PreflightChecker(this.sessionManager);
    this.gitOperations = new GitOperations(this.sessionManager);
    this.repoLockManager = new RepoLockManager();
  }

  /**
   * Start polling for tasks
   */
  start(): void {
    if (this.polling) return;

    // Recover orphaned tasks before starting
    this.recoverOrphanedTasks();

    this.polling = true;
    console.log("[Executor] Started polling for tasks");
    this.poll();
  }

  /**
   * Stop polling for tasks
   */
  stop(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log("[Executor] Stopped polling");
  }

  /**
   * Recover orphaned tasks that were left in CLAIMED or RUNNING state
   * due to a daemon crash or restart.
   *
   * This method is called on executor startup to handle crash recovery.
   * It resets orphaned tasks to FAILED status with a FAILED_DAEMON_RESTART code,
   * except for tasks that just started (within last 30 seconds) to avoid
   * race conditions.
   */
  private recoverOrphanedTasks(): void {
    const now = Date.now();
    const gracePeriodMs = 30 * 1000; // 30 seconds grace period

    // Find all tasks stuck in CLAIMED or RUNNING state
    const orphanedClaimed = getTasks({ status: TaskState.CLAIMED });
    const orphanedRunning = getTasks({ status: TaskState.RUNNING });
    const orphanedTasks = [...orphanedClaimed, ...orphanedRunning];

    if (orphanedTasks.length === 0) {
      return;
    }

    console.log(
      `[Executor] Found ${orphanedTasks.length} orphaned task(s) in CLAIMED/RUNNING state`,
    );

    for (const task of orphanedTasks) {
      // Check if task was recently claimed (within grace period)
      // This avoids resetting tasks that just started
      const claimedAt = task.claimedAt ? new Date(task.claimedAt).getTime() : 0;
      const startedAt = task.startedAt ? new Date(task.startedAt).getTime() : 0;
      const mostRecentTime = Math.max(claimedAt, startedAt);

      if (mostRecentTime > 0 && now - mostRecentTime < gracePeriodMs) {
        console.log(`[Executor] Skipping task ${task.id} (recently started, within grace period)`);
        continue;
      }

      // Reset orphaned task to FAILED
      console.log(`[Executor] Recovering orphaned task ${task.id} (${task.status} -> FAILED)`);
      updateTask(task.id, {
        status: TaskState.FAILED,
        failureCode: "FAILED_DAEMON_RESTART",
        completedAt: new Date().toISOString(),
      });
    }

    console.log("[Executor] Orphaned task recovery complete");
  }

  /**
   * Poll for pending tasks
   */
  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      // Check if we can run more tasks
      if (this.runningTasks.size >= this.maxConcurrentTasks) {
        this.scheduleNextPoll();
        return;
      }

      // RACE CONDITION FIX #1 & #3:
      // Atomically claim the next pending task. This prevents multiple executors
      // from claiming the same task (race #1).
      //
      // The repo lock check has been moved AFTER claiming (inside executeTask),
      // fixing the TOCTOU race condition (race #3) where a task could be claimed
      // between the lock check and the claim operation.
      const claimedTask = claimNextPendingTask();

      if (claimedTask) {
        // Execute task (don't await - let it run concurrently)
        this.executeTask(claimedTask).catch((error) => {
          console.error(`[Executor] Task ${claimedTask.id} failed:`, error);
        });
      }
    } catch (error) {
      console.error("[Executor] Poll error:", error);
    }

    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  /**
   * Execute a single task
   */
  async executeTask(task: Task): Promise<void> {
    console.log(`[Executor] Executing task ${task.id}: ${task.prompt.substring(0, 50)}...`);

    try {
      // Task is already claimed by claimNextPendingTask() in poll()
      // This fixes race condition #1 (atomic claim)

      // Step 1: Start session
      this.sessionManager.startSession(task.id);

      this.sessionManager.emit(EventType.TASK_CLAIMED, EventLevel.INFO, {
        taskId: task.id,
        prompt: task.prompt.substring(0, 200),
      });

      // Step 2: Set up execution environment (worktree or direct mode)
      const setupResult = await setupTaskExecution({ task });

      if (!setupResult.success) {
        await this.handleSetupFailure(task, setupResult.error);
        return;
      }

      const setup = setupResult.data;

      // Emit worktree event if applicable
      if (setup.executionMode === "worktree") {
        this.sessionManager.emit(EventType.WORKTREE_CREATED, EventLevel.INFO, {
          path: setup.workDir,
          branch: setup.taskBranch,
          baseCommitSha: setup.baseCommitSha,
        });
      }

      // Track this task
      this.runningTasks.set(task.id, { task, setup });

      // Step 3: Preflight checks in the work directory
      const preflight = await this.preflightChecker.check(setup.workDir);

      if (!preflight.passed) {
        await this.handlePreflightFailure(task, setup, preflight.error!);
        return;
      }

      // Step 4: Update task with execution details
      updateTask(task.id, {
        workDir: setup.workDir,
        executionMode: setup.executionMode,
        baseCommitSha: setup.baseCommitSha,
        originalBranch: setup.originalBranch,
        branch: setup.taskBranch,
      });

      // Step 5: For direct mode, check clean tree and acquire exclusive lock
      if (setup.executionMode === "direct") {
        if (!task.repoId) {
          await this.failTask(task, setup, "MISSING_REPO_ID", "Task has no repo ID");
          return;
        }

        // Check git tree is clean
        const isClean = await this.gitOperations.isWorkingTreeClean(setup.repoPath);

        if (!isClean) {
          await this.failTask(
            task,
            setup,
            "GIT_TREE_DIRTY",
            "Cannot start task in direct mode: working tree has uncommitted changes. " +
              "Please commit/discard changes, or use worktree mode.",
          );
          return;
        }

        // Acquire exclusive lock
        const lockResult = await this.repoLockManager.acquireExclusive(task.repoId, task.id);

        if (!lockResult.success) {
          const lockHolders = lockResult.lockHolders?.join(", ") || "unknown tasks";
          await this.failTask(
            task,
            setup,
            "REPO_LOCKED",
            `Cannot start task in direct mode: repository locked by ${lockHolders}. ` +
              `Please wait for them to finish, or use worktree mode.`,
          );
          return;
        }

        console.log(`[TaskExecutor] Acquired exclusive lock for task ${task.id}`);
      }

      this.sessionManager.emit(EventType.REPO_LOCK_ACQUIRED, EventLevel.INFO, {
        path: setup.executionMode === "direct" ? setup.repoPath : setup.workDir,
        executionMode: setup.executionMode,
      });

      // Step 6: Execute workflow
      // Update task object with execution details (updateTask only updates DB, not the object)
      task.workDir = setup.workDir;
      task.executionMode = setup.executionMode;
      task.baseCommitSha = setup.baseCommitSha;
      task.originalBranch = setup.originalBranch;
      task.branch = setup.taskBranch;

      const workflowExecutor = new WorkflowExecutor(this.sessionManager);
      await workflowExecutor.executeWorkflow(task);

      // Step 7: Handle success - git operations (commit, push, PR)
      const runningInfo = this.runningTasks.get(task.id);
      if (runningInfo) {
        // Check if workflow handled git operations (smart commit step)
        // If not, fall back to auto-commit
        let prUrl: string | undefined;
        if (!workflowExecutor.hasHandledGitOps()) {
          console.log("[Executor] Workflow didn't handle git ops, using fallback auto-commit");
          prUrl = await this.handleGitOperations(task, runningInfo.setup);
        } else {
          console.log("[Executor] Workflow handled git ops via smart commit step");
        }

        // Tear down execution environment
        const updatedTask = getTaskById(task.id);
        if (updatedTask) {
          await teardownTaskExecution(
            {
              ...updatedTask,
              executionMode: runningInfo.setup.executionMode,
              workDir: runningInfo.setup.workDir,
            } as Task,
            "completed",
          );

          // Emit worktree removed event if applicable
          if (runningInfo.setup.executionMode === "worktree") {
            this.sessionManager.emit(EventType.WORKTREE_REMOVED, EventLevel.INFO, {
              path: runningInfo.setup.workDir,
            });
          }
        }

        // Complete the task
        updateTask(task.id, {
          status: TaskState.COMPLETED,
          completedAt: new Date().toISOString(),
          prUrl,
        });

        this.sessionManager.emit(EventType.TASK_COMPLETED, EventLevel.INFO, {
          taskId: task.id,
          prUrl,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const setup = this.runningTasks.get(task.id)?.setup;
      await this.failTask(task, setup, "FAILED_EXECUTION", message);
    } finally {
      // Cleanup
      const runningInfo = this.runningTasks.get(task.id);
      if (runningInfo) {
        const { setup } = runningInfo;

        // Release lock (for direct mode)
        if (setup.executionMode === "direct" && task.repoId) {
          await this.repoLockManager.release(task.repoId, task.id);
          this.sessionManager.emit(EventType.REPO_LOCK_RELEASED, EventLevel.INFO, {
            path: setup.repoPath,
          });
        }
      }

      // Always end session
      this.sessionManager.endSession();

      // Remove from running tasks
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Get terminal output for a running task (for preview)
   */
  getTerminalOutput(taskId: string): string | null {
    const runner = this.currentSdkRunners.get(taskId);
    return runner?.getCurrentOutput() ?? null;
  }

  /**
   * Get structured terminal messages for a running task (SDK v2)
   */
  getTerminalMessages(taskId: string): SdkMessage[] | null {
    const runner = this.currentSdkRunners.get(taskId);
    return runner?.getMessages() ?? null;
  }

  /**
   * Read transcript from file for completed tasks
   */
  readTranscript(taskId: string): SdkMessage[] {
    return this.sessionManager.readTranscript(taskId);
  }

  private async handleSetupFailure(
    task: Task,
    error: { code: string; message: string },
  ): Promise<void> {
    console.error(`[Executor] Task ${task.id} setup failed: ${error.code} - ${error.message}`);

    if (error.code === "NEEDS_HUMAN_GIT_DIRTY") {
      // Pause instead of fail for dirty repo
      await pauseTask(task.id, "needs_human", error.message, this.sessionManager);
    } else {
      updateTask(task.id, {
        status: TaskState.FAILED,
        failureCode: error.code,
        completedAt: new Date().toISOString(),
      });

      this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
        code: error.code,
        message: error.message,
      });
    }
  }

  private async handlePreflightFailure(
    task: Task,
    setup: TaskSetupResult,
    error: { code: string; message: string },
  ): Promise<void> {
    if (error.code === "NEEDS_HUMAN_GIT_DIRTY") {
      // Pause instead of old needs_human handling
      await pauseTask(task.id, "needs_human", error.message, this.sessionManager);
      await teardownTaskExecution(
        {
          ...task,
          executionMode: setup.executionMode,
          workDir: setup.workDir,
        } as Task,
        "paused",
      );
    } else {
      await this.failTask(task, setup, error.code, error.message);
    }

    this.runningTasks.delete(task.id);
  }

  private async handleNeedsHuman(
    task: Task,
    setup: TaskSetupResult,
    needsHuman: { code: string; question: string },
  ): Promise<void> {
    console.log(`[Executor] Task ${task.id} pausing for human input`);

    // Pause the task (commits WIP, removes worktree if applicable)
    await pauseTask(task.id, "needs_human", needsHuman.question, this.sessionManager);

    // Tear down execution environment
    const updatedTask = getTaskById(task.id);
    if (updatedTask) {
      await teardownTaskExecution(
        {
          ...updatedTask,
          executionMode: setup.executionMode,
          workDir: setup.workDir,
        } as Task,
        "paused",
      );
    }
  }

  /**
   * Handle git operations after task completion (commit, push, PR)
   * Returns prUrl if PR was created successfully
   */
  private async handleGitOperations(
    task: Task,
    setup: TaskSetupResult,
  ): Promise<string | undefined> {
    // Check for changes
    const hasChanges = await this.gitOperations.hasChanges(setup.workDir);

    if (!hasChanges) {
      console.log("[Executor] No changes to commit");
      return undefined;
    }

    // Generate commit message
    const commitMessage = this.generateCommitMessage(task);
    const commitResult = await this.gitOperations.commit(setup.workDir, commitMessage);

    if (!commitResult.success) {
      console.error("[Executor] Commit failed:", commitResult.error);
      return undefined;
    }

    // Push branch
    const pushed = await this.gitOperations.push(setup.workDir, setup.taskBranch);

    if (!pushed) {
      console.error("[Executor] Push failed");
      return undefined;
    }

    // Create PR
    const prTitle = this.generatePrTitle(task);
    const prBody = this.generatePrBody(task);
    const prResult = await this.gitOperations.createPr(setup.workDir, prTitle, prBody);

    if (prResult.success) {
      return prResult.prUrl;
    } else {
      console.log("[Executor] PR creation skipped:", prResult.error);
      return undefined;
    }
  }

  private async handleSuccess(task: Task, setup: TaskSetupResult): Promise<void> {
    // Handle git operations (commit, push, PR)
    const prUrl = await this.handleGitOperations(task, setup);

    // Tear down execution environment
    const updatedTask = getTaskById(task.id);
    if (updatedTask) {
      await teardownTaskExecution(
        {
          ...updatedTask,
          executionMode: setup.executionMode,
          workDir: setup.workDir,
        } as Task,
        "completed",
      );

      // Emit worktree removed event if applicable
      if (setup.executionMode === "worktree") {
        this.sessionManager.emit(EventType.WORKTREE_REMOVED, EventLevel.INFO, {
          path: setup.workDir,
        });
      }
    }

    // Complete the task
    updateTask(task.id, {
      status: TaskState.COMPLETED,
      completedAt: new Date().toISOString(),
      prUrl,
    });

    this.sessionManager.emit(EventType.TASK_COMPLETED, EventLevel.INFO, {
      taskId: task.id,
      prUrl,
    });
  }

  private async failTask(
    task: Task,
    setup: TaskSetupResult | undefined,
    code: string,
    message: string,
  ): Promise<void> {
    console.error(`[Executor] Task ${task.id} failed: ${code} - ${message}`);

    // Tear down execution environment if we have setup info
    if (setup) {
      const updatedTask = getTaskById(task.id);
      if (updatedTask) {
        await teardownTaskExecution(
          {
            ...updatedTask,
            executionMode: setup.executionMode,
            workDir: setup.workDir,
          } as Task,
          "failed",
        );
      }
    }

    updateTask(task.id, {
      status: TaskState.FAILED,
      failureCode: code,
      completedAt: new Date().toISOString(),
    });

    this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
      code,
      message,
    });
  }

  private generateCommitMessage(task: Task): string {
    const prompt = task.prompt.length > 69 ? task.prompt.substring(0, 69) + "..." : task.prompt;
    return `feat: ${prompt}\n\nTask: ${task.id}\nGenerated by Night Shift`;
  }

  private generatePrTitle(task: Task): string {
    const prompt = task.prompt.length > 60 ? task.prompt.substring(0, 60) + "..." : task.prompt;
    return `[Night Shift] ${prompt}`;
  }

  private generatePrBody(task: Task): string {
    return `## Summary

This PR was generated by Night Shift.

**Task ID:** ${task.id}

**Original Request:**
${task.prompt}

---
_Generated by [Night Shift](https://github.com/sipherxyz/nightshift)_`;
  }

  /**
   * Get current tasks being executed
   */
  getCurrentTasks(): Task[] {
    return Array.from(this.runningTasks.values()).map(({ task }) => task);
  }

  /**
   * Get current task (for backwards compatibility)
   */
  getCurrentTask(): Task | null {
    const tasks = this.getCurrentTasks();
    return tasks.length > 0 ? tasks[0]! : null;
  }

  /**
   * Check if executor is running
   */
  isRunning(): boolean {
    return this.polling;
  }

  /**
   * Check if executor has active tasks
   */
  hasActiveTasks(): boolean {
    return this.runningTasks.size > 0;
  }

  /**
   * Get session manager (for external use)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}

/**
 * Create a task executor with default data directory
 */
export function createExecutor(config?: Partial<ExecutorConfig>): TaskExecutor {
  const dataDir = config?.dataDir ?? path.join(os.homedir(), ".nightshift");

  return new TaskExecutor({
    dataDir,
    ...config,
  });
}
