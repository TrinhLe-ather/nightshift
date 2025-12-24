/**
 * Sessions oRPC Contract
 *
 * Type-safe API definitions for session and event retrieval.
 * Converted from Hono routes to oRPC contracts.
 */

import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { getDb, sessions, tasks } from "../../db/drizzle";
import { orpc } from "../base";

// Zod schemas for validation
const sessionEventSchema = z.object({
  schemaVersion: z.number(),
  ts: z.string(),
  seq: z.number(),
  level: z.string(),
  type: z.string(),
  taskId: z.string(),
  runId: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const sessionListItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  eventCount: z.number().nullable(),
  taskPrompt: z.string().nullable(),
});

const sessionDetailSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string(),
  taskPrompt: z.string().nullable(),
  taskStatus: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  events: z.array(sessionEventSchema),
  eventCount: z.number(),
});

interface SessionEvent {
  schemaVersion: number;
  ts: string;
  seq: number;
  level: string;
  type: string;
  taskId: string;
  runId: string;
  data?: Record<string, unknown>;
}

// List sessions with optional taskId filter
const list = orpc
  .input(
    z.object({
      taskId: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }),
  )
  .output(
    z.object({
      sessions: z.array(sessionListItemSchema),
      pagination: z.object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
      }),
    }),
  )
  .handler(async ({ input }) => {
    const db = getDb();
    const { taskId, limit, offset } = input;

    // Build query with join
    let query = db
      .select({
        id: sessions.id,
        taskId: sessions.taskId,
        runId: sessions.runId,
        startedAt: sessions.startedAt,
        completedAt: sessions.completedAt,
        eventCount: sessions.eventCount,
        taskPrompt: tasks.prompt,
      })
      .from(sessions)
      .innerJoin(tasks, eq(sessions.taskId, tasks.id))
      .orderBy(desc(sessions.startedAt))
      .limit(limit)
      .offset(offset);

    if (taskId) {
      query = query.where(eq(sessions.taskId, taskId)) as typeof query;
    }

    const sessionsList = query.all();

    // Get total count
    let countQuery = db.select({ total: count() }).from(sessions);
    if (taskId) {
      countQuery = countQuery.where(eq(sessions.taskId, taskId)) as typeof countQuery;
    }
    const countResult = countQuery.get();

    return {
      sessions: sessionsList.map((s) => ({
        id: s.id,
        taskId: s.taskId,
        runId: s.runId,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        eventCount: s.eventCount,
        taskPrompt:
          s.taskPrompt && s.taskPrompt.length > 100
            ? s.taskPrompt.substring(0, 100) + "..."
            : s.taskPrompt,
      })),
      pagination: {
        total: countResult?.total ?? 0,
        limit,
        offset,
      },
    };
  });

// Get session with full event details
const get = orpc
  .input(z.object({ id: z.string() }))
  .output(sessionDetailSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const session = db
      .select({
        id: sessions.id,
        taskId: sessions.taskId,
        runId: sessions.runId,
        eventsPath: sessions.eventsPath,
        startedAt: sessions.startedAt,
        completedAt: sessions.completedAt,
        eventCount: sessions.eventCount,
        taskPrompt: tasks.prompt,
        taskStatus: tasks.status,
      })
      .from(sessions)
      .innerJoin(tasks, eq(sessions.taskId, tasks.id))
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      throw errors.NOT_FOUND({ message: "Session not found", data: { resource: "session", id } });
    }

    // Read events from NDJSON file
    let events: SessionEvent[] = [];
    if (session.eventsPath && existsSync(session.eventsPath)) {
      try {
        const content = readFileSync(session.eventsPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        events = lines.map((line) => JSON.parse(line) as SessionEvent);
      } catch {
        // Failed to read events file
        events = [];
      }
    }

    return {
      id: session.id,
      taskId: session.taskId,
      runId: session.runId,
      taskPrompt: session.taskPrompt,
      taskStatus: session.taskStatus,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      events,
      eventCount: events.length,
    };
  });

// Get session events after a sequence number
const getEvents = orpc
  .input(
    z.object({
      id: z.string(),
      after: z.number().default(0),
    }),
  )
  .output(
    z.object({
      events: z.array(sessionEventSchema),
      lastSeq: z.number(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id, after } = input;

    const session = db
      .select({
        eventsPath: sessions.eventsPath,
      })
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      throw errors.NOT_FOUND({ message: "Session not found", data: { resource: "session", id } });
    }

    // Read events from NDJSON file
    let events: SessionEvent[] = [];
    if (session.eventsPath && existsSync(session.eventsPath)) {
      try {
        const content = readFileSync(session.eventsPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        events = lines.map((line) => JSON.parse(line) as SessionEvent).filter((e) => e.seq > after);
      } catch {
        events = [];
      }
    }

    return {
      events,
      lastSeq: events.length > 0 ? events[events.length - 1]!.seq : after,
    };
  });

export const sessionsRouter = {
  list,
  get,
  getEvents,
};
