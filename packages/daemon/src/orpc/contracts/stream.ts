/**
 * SSE Streaming Route
 *
 * Server-Sent Events endpoint for real-time task execution updates.
 * GET /api/stream/tasks/:taskId
 */

import { orpc } from "../base";
import { streamEventBus } from "../../streaming/event-bus";
import { getDb, tasks } from "../../db/drizzle";
import { eq } from "drizzle-orm";
import type { StreamEvent } from "../../streaming/event-bus";
import { TranscriptWriter } from "../../executor/transcript-writer";
import { eventIterator, withEventMeta } from "@orpc/server";
import { z } from "zod";
import { getTaskTranscriptPath } from "../../config/paths";

const streamEventSchema = z.object({
  type: z.enum(["message", "status", "typing", "complete", "error"]),
  taskId: z.string(),
  seq: z.number(),
  timestamp: z.string(),
  data: z.unknown(),
});

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise(() => {});
  if (signal.aborted) return;
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

const streamTask = orpc
  .input(
    z.object({
      taskId: z.string(),
      /**
       * Optional resume cursor (primarily for non-oRPC callers).
       * For oRPC streaming, prefer relying on `lastEventId`.
       */
      afterSeq: z.number().int().min(0).optional().default(0),
    }),
  )
  .output(eventIterator(streamEventSchema))
  .handler(async function* ({ input, lastEventId, signal, errors }) {
    const { taskId } = input;

    const afterSeqFromLastEventId =
      typeof lastEventId === "string" && lastEventId.length > 0
        ? Number.parseInt(lastEventId, 10)
        : 0;

    const afterSeq = Math.max(
      Number.isFinite(afterSeqFromLastEventId) ? afterSeqFromLastEventId : 0,
      input.afterSeq ?? 0,
    );

    const db = getDb();

    // Verify task exists
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id: taskId },
      });
    }

    // 1) Send historical messages first (if transcript exists)
    try {
      const sessionPath = getTaskTranscriptPath(taskId, process.env.NIGHTSHIFT_DATA_DIR);
      const historicalEntries = TranscriptWriter.readEntries(sessionPath, afterSeq);

      for (const entry of historicalEntries) {
        const event: StreamEvent = {
          type: "message",
          taskId,
          seq: entry.seq,
          timestamp: entry.ts,
          data: entry.message,
        };

        yield withEventMeta(event, { id: entry.seq.toString() });
      }
    } catch {
      // No transcript yet or error reading - ok; will get live updates
    }

    // 2) Bridge live updates (push-based) into this async generator (pull-based)
    const pending: StreamEvent[] = [];
    let wake: (() => void) | null = null;
    const wakeIfNeeded = () => {
      if (wake) {
        const fn = wake;
        wake = null;
        fn();
      }
    };

    const unsubscribe = streamEventBus.subscribe(taskId, (event: StreamEvent) => {
      // Only send events after the requested sequence
      if (event.seq <= afterSeq) return;
      pending.push(event);
      wakeIfNeeded();
    });

    try {
      const abortPromise = waitForAbort(signal);

      while (!signal?.aborted) {
        if (pending.length === 0) {
          await Promise.race([
            abortPromise,
            new Promise<void>((resolve) => {
              wake = resolve;
            }),
          ]);
        }

        while (pending.length > 0) {
          const event = pending.shift()!;
          yield withEventMeta(event, { id: event.seq.toString() });

          // If the task signals completion, end the stream.
          if (event.type === "complete" || event.type === "error") {
            return;
          }
        }
      }
    } finally {
      unsubscribe();
    }
  });

export const streamRouter = {
  task: streamTask,
};
