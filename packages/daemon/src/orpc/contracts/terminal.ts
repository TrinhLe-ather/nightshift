/**
 * Terminal oRPC Contract
 *
 * API for accessing terminal output from tasks (live or historical).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, tasks } from "../../db/drizzle";
import { orpc } from "../base";
import type { SdkMessage } from "../../executor/sdk";

// Provider functions injected via router setup
let getTerminalOutputFn: ((taskId: string) => string | null) | null = null;
let getTerminalMessagesFn: ((taskId: string) => SdkMessage[] | null) | null = null;
let readTranscriptFn: ((taskId: string) => SdkMessage[]) | null = null;

/**
 * Set the function to get terminal output from the executor (legacy text format)
 * Called during router setup
 */
export function setTerminalOutputProvider(fn: (taskId: string) => string | null): void {
  getTerminalOutputFn = fn;
}

/**
 * Set the function to get structured terminal messages from the executor (SDK v2)
 * Called during router setup
 */
export function setTerminalMessagesProvider(fn: (taskId: string) => SdkMessage[] | null): void {
  getTerminalMessagesFn = fn;
}

/**
 * Set the function to read transcript from file (for completed tasks)
 * Called during router setup
 */
export function setTranscriptReader(fn: (taskId: string) => SdkMessage[]): void {
  readTranscriptFn = fn;
}

/** Schema for structured SDK messages */
const sdkMessageSchema = z.object({
  type: z.enum(["system", "assistant", "tool", "result", "error", "user"]),
  timestamp: z.string(),
  content: z.string(),
  toolName: z.string().optional(),
  toolArgs: z.unknown().optional(),
  toolResult: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Get terminal preview for a running task
 */
const getPreview = orpc
  .input(
    z.object({
      taskId: z.string(),
      /** Number of lines to return (default: 100) */
      lines: z.number().optional().default(100),
    }),
  )
  .output(
    z.object({
      /** Terminal content (formatted text - legacy) */
      content: z.string(),
      /** Structured messages (SDK v2) */
      messages: z.array(sdkMessageSchema).optional(),
      /** Whether the task is currently running */
      isLive: z.boolean(),
      /** Timestamp of when content was captured */
      capturedAt: z.string(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { taskId } = input;

    // Verify task exists
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    const isLive = task.status === "running";

    // Get terminal output
    let content = "";
    let messages: SdkMessage[] | undefined;

    if (isLive) {
      // Task is running - get from in-memory executor
      if (getTerminalMessagesFn) {
        const msgs = getTerminalMessagesFn(taskId);
        if (msgs && msgs.length > 0) {
          messages = msgs;
        }
      }

      // Get text content (legacy/fallback)
      if (getTerminalOutputFn) {
        const output = getTerminalOutputFn(taskId);
        if (output) {
          const lines = output.split("\n");
          content = lines.slice(-input.lines).join("\n");
        }
      }
    } else {
      // Task is not running - read from persisted transcript file
      if (readTranscriptFn) {
        const msgs = readTranscriptFn(taskId);
        if (msgs && msgs.length > 0) {
          messages = msgs;
        }
      }
    }

    return {
      content,
      messages,
      isLive,
      capturedAt: new Date().toISOString(),
    };
  });

export const terminalRouter = {
  getPreview,
} as const;
