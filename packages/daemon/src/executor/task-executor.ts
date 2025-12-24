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
import { SessionManager } from "./session-manager";
import { PreflightChecker } from "./preflight-checker";
import { GitOperations } from "./git-operations";
import { type ClaudeRunResult, ClaudeRunner } from "./claude-runner";
import { RepoLock } from "./repo-lock";
import { type TaskSetupResult, setupTaskExecution, teardownTaskExecution } from "./task-setup";
import { buildResumePrompt, pauseTask } from "./task-lifecycle";
import { getTaskById, getTasks, updateTask } from "../tasks/repository";
import { EventLevel, EventType, TaskState } from "@nightshift/shared";
import type { Task } from "@nightshift/shared";

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
  private claudeRunner: ClaudeRunner;
  private repoLock: RepoLock;

  constructor(config: ExecutorConfig) {
    this.dataDir = config.dataDir;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxConcurrentTasks = config.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;

    // Initialize components
    this.sessionManager = new SessionManager(this.dataDir);
    this.preflightChecker = new PreflightChecker(this.sessionManager);
    this.gitOperations = new GitOperations(this.sessionManager);
    this.claudeRunner = new ClaudeRunner(this.sessionManager);
    this.repoLock = new RepoLock(this.dataDir);
  }

  /**
   * Start polling for tasks
   */
  start(): void {
    if (this.polling) return;

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

      // Find oldest pending task
      const pendingTasks = getTasks({ status: TaskState.PENDING, limit: 1 });

      if (pendingTasks.length > 0) {
        const task = pendingTasks[0];

        // Check if this repo already has a running task in direct mode
        if (task.repoPath && this.isRepoLockedForDirectMode(task.repoPath)) {
          console.log(`[Executor] Repo ${task.repoPath} has a direct-mode task running, skipping`);
          this.scheduleNextPoll();
          return;
        }

        // Execute task (don't await - let it run concurrently)
        this.executeTask(task).catch((error) => {
          console.error(`[Executor] Task ${task.id} failed:`, error);
        });
      }
    } catch (error) {
      console.error("[Executor] Poll error:", error);
    }

    this.scheduleNextPoll();
  }

  /**
   * Check if a repo is locked by a direct-mode task
   */
  private isRepoLockedForDirectMode(repoPath: string): boolean {
    for (const [, { _task, setup }] of this.runningTasks) {
      if (setup.executionMode === "direct" && setup.repoPath === repoPath) {
        return true;
      }
    }
    return false;
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
      // Step 1: Claim task
      const claimedTask = await this.claimTask(task);
      if (!claimedTask) {
        return;
      }

      // Step 2: Start session
      this.sessionManager.startSession(task.id);

      this.sessionManager.emit(EventType.TASK_CLAIMED, EventLevel.INFO, {
        taskId: task.id,
        prompt: task.prompt.substring(0, 200),
      });

      // Step 3: Set up execution environment (worktree or direct mode)
      const setupResult = await setupTaskExecution({ task: claimedTask });

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

      // Step 4: Preflight checks in the work directory
      const preflight = await this.preflightChecker.check(setup.workDir);

      if (!preflight.passed) {
        await this.handlePreflightFailure(task, setup, preflight.error!);
        return;
      }

      // Step 5: Acquire lock (for direct mode, lock repo; for worktree, lock worktree path)
      const lockPath = setup.executionMode === "direct" ? setup.repoPath : setup.workDir;
      const locked = this.repoLock.acquire(lockPath, task.id);
      if (!locked) {
        await this.failTask(task, setup, "REPO_LOCK_FAILED", "Could not acquire lock");
        return;
      }

      this.sessionManager.emit(EventType.REPO_LOCK_ACQUIRED, EventLevel.INFO, {
        path: lockPath,
        executionMode: setup.executionMode,
      });

      // Step 6: Transition to RUNNING
      await this.transitionToRunning(task);

      // Step 7: Run Claude in the work directory
      const result = await this.runClaude(task, setup);

      // Step 8: Handle result
      if (result.needsHuman) {
        await this.handleNeedsHuman(task, setup, result.needsHuman);
      } else if (result.success) {
        await this.handleSuccess(task, setup);
      } else {
        await this.failTask(task, setup, "FAILED_EXECUTION", result.error || "Unknown error");
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
        const lockPath = setup.executionMode === "direct" ? setup.repoPath : setup.workDir;

        // Release lock
        this.repoLock.release(lockPath, task.id);
        this.sessionManager.emit(EventType.REPO_LOCK_RELEASED, EventLevel.INFO, {
          path: lockPath,
        });
      }

      // End session
      this.sessionManager.endSession();

      // Remove from running tasks
      this.runningTasks.delete(task.id);
    }
  }

  private async claimTask(task: Task): Promise<Task | null> {
    const updated = updateTask(task.id, {
      status: TaskState.CLAIMED,
      claimedAt: new Date().toISOString(),
    });

    return updated;
  }

  private async transitionToRunning(task: Task): Promise<void> {
    updateTask(task.id, {
      status: TaskState.RUNNING,
      startedAt: new Date().toISOString(),
    });

    this.sessionManager.emit(EventType.TASK_STARTED, EventLevel.INFO, {
      taskId: task.id,
    });
  }

  private async runClaude(task: Task, setup: TaskSetupResult): Promise<ClaudeRunResult> {
    // Build prompt - include resume context if this is a resumed task
    let prompt = task.prompt;
    if (task.humanResponse || task.pauseReason) {
      prompt = buildResumePrompt(task, task.prompt);
    }

    return this.claudeRunner.run({
      prompt,
      workDir: setup.workDir, // Use workDir (worktree or repo)
      timeout: this.timeoutMs,
      onNeedsHuman: (question) => {
        console.log(`[Executor] Task ${task.id} needs human input: ${question}`);
      },
    });
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

    this.sessionManager.endSession();
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
    this.sessionManager.endSession();
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

  private async handleSuccess(task: Task, setup: TaskSetupResult): Promise<void> {
    let prUrl: string | undefined;

    // Check for changes and create PR
    const hasChanges = await this.gitOperations.hasChanges(setup.workDir);

    if (hasChanges) {
      // Generate commit message
      const commitMessage = this.generateCommitMessage(task);
      const commitResult = await this.gitOperations.commit(setup.workDir, commitMessage);

      if (commitResult.success) {
        // Push and create PR
        const pushed = await this.gitOperations.push(setup.workDir, setup.taskBranch);

        if (pushed) {
          const prTitle = this.generatePrTitle(task);
          const prBody = this.generatePrBody(task);
          const prResult = await this.gitOperations.createPr(setup.workDir, prTitle, prBody);

          if (prResult.success) {
            prUrl = prResult.prUrl;
          } else {
            console.log("[Executor] PR creation skipped:", prResult.error);
          }
        }
      }
    }

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
    const prompt = task.prompt.substring(0, 72);
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
_Generated by [Night Shift](https://github.com/nightshift)_`;
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
    return tasks.length > 0 ? tasks[0] : null;
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
