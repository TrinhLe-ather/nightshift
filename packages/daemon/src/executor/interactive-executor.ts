/**
 * Interactive Executor
 *
 * Manages interactive chat sessions with Claude.
 * Handles message persistence, checkpointing, and session lifecycle.
 */

import { SdkRunner } from "./sdk";
import type { SessionManager } from "./session-manager";
import type { RepoLockManager } from "./repo-lock-manager";
import { getTaskById, updateTask } from "../tasks/repository";
import { getDb, messages as messagesTable } from "../db/drizzle";
import { EventType, EventLevel, TaskState } from "@nightshift/shared";
import type { Task } from "@nightshift/shared";

export class InteractiveExecutor {
  constructor(
    private sessionManager: SessionManager,
    private dataDir: string,
    private repoLockManager?: RepoLockManager,
    private taskExecutor?: any, // Optional TaskExecutor for runner tracking
  ) {}

  /**
   * Start an interactive session for a task
   */
  async startSession(task: Task): Promise<void> {
    // Start session tracking
    this.sessionManager.startSession(task.id);

    // Emit task started event
    this.sessionManager.emit(EventType.TASK_STARTED, EventLevel.INFO, {
      taskId: task.id,
    });

    // Update task to RUNNING status with startedAt timestamp
    updateTask(task.id, {
      status: TaskState.RUNNING,
      startedAt: new Date().toISOString(),
    });

    // Save initial user message to DB
    this.saveUserMessage(task.id, task.prompt);

    // Send the initial prompt
    await this.sendMessage(task.id, task.prompt);
  }

  /**
   * Queue a message for interactive session (non-blocking)
   * Sets up the message and updates task status, but doesn't wait for execution
   */
  async queueMessage(taskId: string, userMessage: string): Promise<void> {
    // Get task by ID
    const task = getTaskById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Ensure we have an active session - if not, start one
    const currentSession = this.sessionManager.getSession();
    const needsSessionStart = !currentSession || currentSession.taskId !== taskId;

    if (needsSessionStart) {
      console.log(`[InteractiveExecutor] Starting new session for task ${taskId}`);
      this.sessionManager.startSession(taskId);
    }

    // Save user message to messages table (skip if this is the initial message already saved)
    // Note: messageCount is a new field in DB schema, may not be in shared types yet
    const currentMessageCount = (task as { messageCount?: number }).messageCount ?? 0;
    if (userMessage !== task.prompt || currentMessageCount > 0) {
      this.saveUserMessage(taskId, userMessage);
    }

    // Update task (status=RUNNING)
    updateTask(taskId, {
      status: TaskState.RUNNING,
    });

    // Write user message to transcript so it appears in UI
    this.sessionManager.writeTranscriptMessage({
      type: "user",
      timestamp: new Date().toISOString(),
      content: userMessage,
    });
  }

  /**
   * Execute a message in the background (blocking, runs asynchronously)
   * @private
   */
  private async executeMessage(
    taskId: string,
    userMessage: string,
    resumeSessionId?: string,
  ): Promise<void> {
    try {
      // Get task again (may have changed since queueing)
      const task = getTaskById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Create SdkRunner with checkpointing enabled
      const runner = new SdkRunner(this.sessionManager);

      // Determine working directory (use workDir if set, otherwise repoPath)
      const workDir = task.workDir ?? task.repoPath;
      if (!workDir) {
        throw new Error(`Task ${taskId} has no working directory or repo path`);
      }

      // Determine permission mode based on autoYes
      const permissionMode = task.autoYes ? "acceptEdits" : "default";

      // Register runner for live message streaming (if taskExecutor available)
      if (this.taskExecutor?.registerSdkRunner) {
        this.taskExecutor.registerSdkRunner(taskId, runner);
      }

      try {
        // Run with: prompt=userMessage, workDir, timeout=30min, sdkSessionId, permissionMode, enableCheckpointing=true
        const result = await runner.run({
          prompt: userMessage,
          workDir,
          timeout: 30 * 60 * 1000, // 30 minutes
          sdkSessionId: resumeSessionId ?? task.sdkSessionId,
          permissionMode,
          enableCheckpointing: true,
        });

        // Store SDK session ID if returned
        if (result.sdkSessionId) {
          updateTask(taskId, { sdkSessionId: result.sdkSessionId });
        }

        // Save assistant message metadata (checkpointId from result)
        this.saveAssistantMessage(
          taskId,
          result.output ?? "",
          result.checkpointId,
        );

        // Update task to PAUSED status with pauseReason='manual'
        updateTask(taskId, {
          status: TaskState.PAUSED,
          pausedAt: new Date().toISOString(),
          pauseReason: "manual",
        });

        // Emit AGENT_MESSAGE event
        const finalMessageCount = (task as { messageCount?: number }).messageCount ?? 0;
        this.sessionManager.emit(EventType.AGENT_MESSAGE, EventLevel.INFO, {
          checkpointId: result.checkpointId,
          messageCount: finalMessageCount + 1,
        });
      } finally {
        // Unregister runner after completion
        if (this.taskExecutor?.unregisterSdkRunner) {
          this.taskExecutor.unregisterSdkRunner(taskId);
        }
      }
    } catch (error) {
      // Handle errors that occur during background execution
      console.error(`[InteractiveExecutor] Error executing message for task ${taskId}:`, error);

      // Update task to FAILED status
      updateTask(taskId, {
        status: TaskState.FAILED,
        completedAt: new Date().toISOString(),
        failureCode: error instanceof Error ? error.message : "Unknown error during execution",
      });

      // Emit error event
      this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Unregister runner if it was registered
      if (this.taskExecutor?.unregisterSdkRunner) {
        this.taskExecutor.unregisterSdkRunner(taskId);
      }
    }
  }

  /**
   * Send a message in an interactive session
   * Queues the message and spawns background execution (non-blocking)
   */
  async sendMessage(
    taskId: string,
    userMessage: string,
    resumeSessionId?: string,
  ): Promise<void> {
    // Queue the message (updates DB, sets status to RUNNING)
    await this.queueMessage(taskId, userMessage);

    // Spawn background execution (don't await)
    this.executeMessage(taskId, userMessage, resumeSessionId).catch((error) => {
      // Error already handled in executeMessage, this is just a safety net
      console.error(`[InteractiveExecutor] Uncaught error in background execution:`, error);
    });
  }

  /**
   * End an interactive session
   */
  async endSession(taskId: string): Promise<void> {
    // Verify we have an active session for this task
    const currentSession = this.sessionManager.getSession();
    if (currentSession && currentSession.taskId === taskId) {
      // Emit TASK_COMPLETED event
      this.sessionManager.emit(EventType.TASK_COMPLETED, EventLevel.INFO, {
        taskId,
      });

      // End session tracking
      this.sessionManager.endSession();
    }

    // Update task to COMPLETED with completedAt timestamp
    updateTask(taskId, {
      status: TaskState.COMPLETED,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Rewind to a specific checkpoint
   */
  async rewindToCheckpoint(taskId: string, checkpointId: string): Promise<void> {
    // Get task and verify sdkSessionId exists
    const task = getTaskById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.sdkSessionId) {
      throw new Error(`Task ${taskId} has no SDK session ID (cannot rewind without a session)`);
    }

    // Log the rewind operation
    console.log(`[InteractiveExecutor] Rewinding task ${taskId} to checkpoint ${checkpointId}`);

    // TODO: Need to implement SDK rewind via resuming session and calling rewindFiles()
    // This will require:
    // 1. Resume the SDK session using task.sdkSessionId
    // 2. Call rewindFiles(checkpointId) on the session
    // 3. Update the task state to reflect the rewind
    // 4. Clean up messages after the checkpoint in the messages table

    // Emit CHECKPOINT_RESTORED event
    this.sessionManager.emit(EventType.CHECKPOINT_RESTORED, EventLevel.INFO, {
      taskId,
      checkpointId,
    });
  }

  /**
   * Save a user message to the database
   */
  private saveUserMessage(taskId: string, content: string): string {
    const db = getDb();

    // Generate message ID: msg_${crypto.randomUUID()}
    const messageId = `msg_${crypto.randomUUID()}`;

    // Insert into messages table with role='user', content, timestamp
    db.insert(messagesTable)
      .values({
        id: messageId,
        taskId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      })
      .run();

    return messageId;
  }

  /**
   * Save an assistant message to the database
   */
  private saveAssistantMessage(
    taskId: string,
    content: string,
    checkpointId?: string,
  ): string {
    const db = getDb();

    // Generate message ID
    const messageId = `msg_${crypto.randomUUID()}`;

    // Insert into messages table with role='assistant', content='', timestamp, checkpointId
    // Content is empty in DB (full content in NDJSON via SessionManager)
    db.insert(messagesTable)
      .values({
        id: messageId,
        taskId,
        role: "assistant",
        content: "", // Empty in DB, stored in transcript
        timestamp: new Date().toISOString(),
        checkpointId: checkpointId ?? null,
      })
      .run();

    return messageId;
  }
}
