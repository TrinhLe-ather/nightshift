/**
 * Conversations oRPC Contract
 *
 * Type-safe API definitions for interactive task conversations.
 * Handles message sending, history retrieval, and checkpoint management.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb, tasks, messages as messagesTable } from "../../db/drizzle";
import { orpc } from "../base";
import { InteractiveExecutor } from "../../executor/interactive-executor";
import { getSessionManager } from "../../executor/session-manager";

// Zod schemas
const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const messageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
  checkpointId: z.string().nullable(),
  toolCalls: z.string().nullable(),
});

// Send a message in an interactive session
const sendMessage = orpc
  .input(
    z.object({
      taskId: z.string(),
      message: z.string().min(1, "Message cannot be empty"),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      messageId: z.string().optional(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const { taskId, message } = input;

    const db = getDb();

    // Verify task exists and is interactive
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    if (task.type !== "interactive") {
      throw errors.INVALID_STATE({
        message: `Cannot send messages to non-interactive tasks (type: ${task.type})`,
      });
    }

    // Check task is in a valid state for receiving messages
    // Allow paused tasks but prevent concurrent sends to running tasks
    if (task.status === "running") {
      throw errors.INVALID_STATE({
        message: `Task is already processing a message (status: running). Please wait for it to complete.`,
      });
    }

    const validStates = ["paused", "needs_human"];
    if (!validStates.includes(task.status)) {
      throw errors.INVALID_STATE({
        message: `Task must be paused to receive messages. Current status: ${task.status}`,
      });
    }

    try {
      // Get session manager and create interactive executor
      const sessionManager = getSessionManager();
      const executor = new InteractiveExecutor(
        sessionManager,
        process.env.NIGHTSHIFT_DATA_DIR || "~/.nightshift",
      );

      // Send the message
      await executor.sendMessage(taskId, message, task.sdkSessionId || undefined);

      return {
        success: true,
      };
    } catch (error) {
      console.error("[conversations.sendMessage] Error:", error);

      // Provide more specific error messages
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";

      // If task got stuck in running state, provide helpful error
      if (errorMessage.includes("session") || errorMessage.includes("Session")) {
        return {
          success: false,
          error: "Failed to resume conversation session. The task may need to be restarted.",
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

// Get conversation messages for a task
const getMessages = orpc
  .input(
    z.object({
      taskId: z.string(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }),
  )
  .output(
    z.object({
      messages: z.array(messageSchema),
      total: z.number(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const { taskId, limit, offset } = input;

    const db = getDb();

    // Verify task exists
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    // Get messages ordered by timestamp (oldest first)
    const messageList = db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.taskId, taskId))
      .orderBy(messagesTable.timestamp)
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count
    const totalResult = db
      .select({ count: messagesTable.id })
      .from(messagesTable)
      .where(eq(messagesTable.taskId, taskId))
      .all();

    return {
      messages: messageList,
      total: totalResult.length,
    };
  });

// Rewind to a specific checkpoint
const rewindToCheckpoint = orpc
  .input(
    z.object({
      taskId: z.string(),
      checkpointId: z.string(),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const { taskId, checkpointId } = input;

    const db = getDb();

    // Verify task exists and is interactive
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    if (task.type !== "interactive") {
      throw errors.INVALID_STATE({
        message: `Cannot rewind non-interactive tasks (type: ${task.type})`,
      });
    }

    if (!task.sdkSessionId) {
      throw errors.INVALID_STATE({
        message: "Task has no SDK session (cannot rewind without a session)",
      });
    }

    // Verify checkpoint exists in messages
    const checkpoint = db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.taskId, taskId), eq(messagesTable.checkpointId, checkpointId)))
      .get();

    if (!checkpoint) {
      throw errors.NOT_FOUND({
        message: "Checkpoint not found",
        data: { resource: "checkpoint", id: checkpointId },
      });
    }

    try {
      // Get session manager and create interactive executor
      const sessionManager = getSessionManager();
      const executor = new InteractiveExecutor(
        sessionManager,
        process.env.NIGHTSHIFT_DATA_DIR || "~/.nightshift",
      );

      // Rewind to checkpoint
      await executor.rewindToCheckpoint(taskId, checkpointId);

      return {
        success: true,
      };
    } catch (error) {
      console.error("[conversations.rewindToCheckpoint] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to rewind to checkpoint",
      };
    }
  });

// End an interactive session
const endSession = orpc
  .input(
    z.object({
      taskId: z.string(),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const { taskId } = input;

    const db = getDb();

    // Verify task exists and is interactive
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    if (task.type !== "interactive") {
      throw errors.INVALID_STATE({
        message: `Cannot end session for non-interactive tasks (type: ${task.type})`,
      });
    }

    // Check task is not already completed
    if (["completed", "failed", "canceled"].includes(task.status)) {
      throw errors.INVALID_STATE({
        message: `Task already in terminal state (status: ${task.status})`,
      });
    }

    try {
      // Get session manager and create interactive executor
      const sessionManager = getSessionManager();
      const executor = new InteractiveExecutor(
        sessionManager,
        process.env.NIGHTSHIFT_DATA_DIR || "~/.nightshift",
      );

      // End the session
      await executor.endSession(taskId);

      return {
        success: true,
      };
    } catch (error) {
      console.error("[conversations.endSession] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to end session",
      };
    }
  });

export const conversationsRouter = {
  sendMessage,
  getMessages,
  rewindToCheckpoint,
  endSession,
};
