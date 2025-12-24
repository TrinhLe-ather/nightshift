/**
 * Session Manager
 *
 * Handles session lifecycle and event logging using Drizzle ORM.
 * Events are written as NDJSON to ~/.nightshift/sessions/{taskId}.ndjson
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb, sessions } from "../db/drizzle";
import { EventLevel, EventType } from "@nightshift/shared";

const SESSION_SCHEMA_VERSION = 1;

export interface SessionEvent {
  schemaVersion: number;
  ts: string;
  seq: number;
  level: EventLevel;
  type: EventType;
  taskId: string;
  runId: string;
  data?: Record<string, unknown>;
}

export interface Session {
  id: string;
  taskId: string;
  runId: string;
  eventsPath: string;
  startedAt: string;
  completedAt?: string;
  eventCount: number;
}

export class SessionManager {
  private sessionsDir: string;
  private currentSession: Session | null = null;
  private eventSequence = 0;
  private writeStream: fs.WriteStream | null = null;

  constructor(dataDir: string) {
    this.sessionsDir = path.join(dataDir, "sessions");
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Start a new session for a task
   */
  startSession(taskId: string): Session {
    const db = getDb();
    const runId = `run_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const sessionId = `session_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const eventsPath = path.join(this.sessionsDir, `${taskId}.ndjson`);
    const startedAt = new Date().toISOString();

    // Create session record in database
    db.insert(sessions)
      .values({
        id: sessionId,
        taskId,
        runId,
        eventsPath,
        startedAt,
        eventCount: 0,
      })
      .run();

    this.currentSession = {
      id: sessionId,
      taskId,
      runId,
      eventsPath,
      startedAt,
      eventCount: 0,
    };

    this.eventSequence = 0;

    // Open write stream for events
    this.writeStream = fs.createWriteStream(eventsPath, { flags: "a" });

    // Emit session started event
    this.emit(EventType.SESSION_STARTED, EventLevel.INFO, {
      sessionId,
      taskId,
      runId,
    });

    return this.currentSession;
  }

  /**
   * Emit an event to the session log
   */
  emit(type: EventType, level: EventLevel = EventLevel.INFO, data?: Record<string, unknown>): void {
    if (!this.currentSession || !this.writeStream) {
      console.warn("No active session, cannot emit event:", type);
      return;
    }

    const event: SessionEvent = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      seq: ++this.eventSequence,
      level,
      type,
      taskId: this.currentSession.taskId,
      runId: this.currentSession.runId,
      data,
    };

    // Write as NDJSON (newline-delimited JSON)
    this.writeStream.write(JSON.stringify(event) + "\n");

    // Update event count in database
    this.currentSession.eventCount = this.eventSequence;
    const db = getDb();
    db.update(sessions)
      .set({ eventCount: this.eventSequence })
      .where(eq(sessions.id, this.currentSession.id))
      .run();
  }

  /**
   * End the current session
   */
  endSession(): void {
    if (!this.currentSession) return;

    const completedAt = new Date().toISOString();

    // Emit session ended event
    this.emit(EventType.SESSION_ENDED, EventLevel.INFO, {
      duration: Date.now() - new Date(this.currentSession.startedAt).getTime(),
      eventCount: this.eventSequence,
    });

    // Update session in database
    const db = getDb();
    db.update(sessions)
      .set({
        completedAt,
        eventCount: this.eventSequence,
      })
      .where(eq(sessions.id, this.currentSession.id))
      .run();

    // Close write stream
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }

    this.currentSession = null;
    this.eventSequence = 0;
  }

  /**
   * Get the current session
   */
  getSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Get session by task ID
   */
  getSessionByTaskId(taskId: string): Session | null {
    const db = getDb();
    const row = db
      .select()
      .from(sessions)
      .where(eq(sessions.taskId, taskId))
      .orderBy(desc(sessions.startedAt))
      .limit(1)
      .get();

    if (!row) return null;

    return {
      id: row.id,
      taskId: row.taskId,
      runId: row.runId,
      eventsPath: row.eventsPath ?? "",
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      eventCount: row.eventCount ?? 0,
    };
  }

  /**
   * Get all sessions for a task
   */
  getSessionsByTaskId(taskId: string): Session[] {
    const db = getDb();
    const rows = db
      .select()
      .from(sessions)
      .where(eq(sessions.taskId, taskId))
      .orderBy(desc(sessions.startedAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      runId: row.runId,
      eventsPath: row.eventsPath ?? "",
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      eventCount: row.eventCount ?? 0,
    }));
  }

  /**
   * Read events from session file
   */
  readEvents(taskId: string, afterSeq = 0): SessionEvent[] {
    const session = this.getSessionByTaskId(taskId);
    if (!session || !fs.existsSync(session.eventsPath)) {
      return [];
    }

    const content = fs.readFileSync(session.eventsPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const events: SessionEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as SessionEvent;
        if (event.seq > afterSeq) {
          events.push(event);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  }
}
