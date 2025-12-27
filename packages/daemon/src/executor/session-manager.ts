/**
 * Session Manager
 *
 * Handles session lifecycle and event logging using Drizzle ORM.
 * Events are written as NDJSON to ~/.nightshift/sessions/{taskId}.ndjson
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { desc, eq } from "drizzle-orm";
import { getDb, sessions } from "../db/drizzle";
import { EventLevel, EventType } from "@nightshift/shared";
import { TranscriptWriter, type TranscriptEntry } from "./transcript-writer";
import type { SdkMessage } from "./sdk";
import { resolveNightShiftDir } from "../config/paths";

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
  transcriptPath?: string;
  startedAt: string;
  completedAt?: string;
  eventCount: number;
  messageCount: number;
}

type SessionContext = { taskId: string };

type ActiveSession = {
  session: Session;
  eventSequence: number;
  writeStream: fs.WriteStream;
  transcriptWriter: TranscriptWriter;
};

export class SessionManager {
  private sessionsDir: string;
  private readonly context = new AsyncLocalStorage<SessionContext>();
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(dataDir: string) {
    const resolvedDataDir = resolveNightShiftDir(dataDir);
    this.sessionsDir = path.join(resolvedDataDir, "sessions");
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
    const existing = this.activeSessions.get(taskId);
    if (existing) {
      return existing.session;
    }

    const db = getDb();
    const runId = `run_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const sessionId = `session_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    // Write events per-run to avoid seq collisions across multiple sessions for the same task.
    const eventsPath = path.join(this.sessionsDir, `${taskId}.${runId}.ndjson`);
    const startedAt = new Date().toISOString();

    // Start transcript writer and get path
    const transcriptWriter = new TranscriptWriter(this.sessionsDir);
    const transcriptPath = transcriptWriter.start(taskId);

    // Create session record in database
    db.insert(sessions)
      .values({
        id: sessionId,
        taskId,
        runId,
        eventsPath,
        transcriptPath,
        startedAt,
        eventCount: 0,
        messageCount: 0,
      })
      .run();

    const session: Session = {
      id: sessionId,
      taskId,
      runId,
      eventsPath,
      transcriptPath,
      startedAt,
      eventCount: 0,
      messageCount: 0,
    };

    // Open write stream for events
    const writeStream = fs.createWriteStream(eventsPath, { flags: "a" });

    this.activeSessions.set(taskId, {
      session,
      eventSequence: 0,
      writeStream,
      transcriptWriter,
    });

    // Emit session started event
    this.emitForTask(taskId, EventType.SESSION_STARTED, EventLevel.INFO, {
      sessionId,
      taskId,
      runId,
    });

    return session;
  }

  /**
   * Run a function with the given taskId bound as the "current" session context.
   * This is required for concurrent task execution: each task gets its own
   * isolated session context even when running in parallel.
   */
  runWithSession<T>(taskId: string, fn: () => Promise<T> | T): Promise<T> | T {
    return this.context.run({ taskId }, fn);
  }

  private getActiveSessionFromContext(): ActiveSession | null {
    const ctx = this.context.getStore();
    if (!ctx) return null;
    return this.activeSessions.get(ctx.taskId) ?? null;
  }

  private emitForTask(
    taskId: string,
    type: EventType,
    level: EventLevel = EventLevel.INFO,
    data?: Record<string, unknown>,
  ): void {
    const active = this.activeSessions.get(taskId);
    if (!active) {
      console.warn("No active session, cannot emit event:", type);
      return;
    }

    const seq = (active.eventSequence += 1);

    const event: SessionEvent = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      seq,
      level,
      type,
      taskId: active.session.taskId,
      runId: active.session.runId,
      data,
    };

    // Write as NDJSON (newline-delimited JSON)
    active.writeStream.write(JSON.stringify(event) + "\n");

    // Update event count in database
    active.session.eventCount = seq;
    const db = getDb();
    db.update(sessions).set({ eventCount: seq }).where(eq(sessions.id, active.session.id)).run();
  }

  /**
   * Emit an event to the session log
   */
  emit(type: EventType, level: EventLevel = EventLevel.INFO, data?: Record<string, unknown>): void {
    const active = this.getActiveSessionFromContext();
    if (!active) {
      console.warn("No active session, cannot emit event:", type);
      return;
    }
    this.emitForTask(active.session.taskId, type, level, data);
  }

  /**
   * End the current session
   *
   * DEFENSIVE: Guards against double-close by checking if session exists.
   * Multiple calls to endSession are safe and will be ignored after the first.
   */
  endSession(): void {
    const active = this.getActiveSessionFromContext();
    if (!active) return;

    const completedAt = new Date().toISOString();
    const messageCount = active.transcriptWriter.getSequence();

    // Emit session ended event
    this.emitForTask(active.session.taskId, EventType.SESSION_ENDED, EventLevel.INFO, {
      duration: Date.now() - new Date(active.session.startedAt).getTime(),
      eventCount: active.eventSequence,
      messageCount,
    });

    // Flush write stream before closing to ensure all events are persisted
    try {
      active.writeStream.end();
    } catch (error) {
      console.error("[SessionManager] Error closing write stream:", error);
    }

    // Update session in database (after flush to ensure final event is written)
    const db = getDb();
    db.update(sessions)
      .set({
        completedAt,
        eventCount: active.eventSequence,
        messageCount,
      })
      .where(eq(sessions.id, active.session.id))
      .run();

    // Close transcript writer
    try {
      active.transcriptWriter.close();
    } catch (error) {
      console.error("[SessionManager] Error closing transcript writer:", error);
    }

    // Remove task session (prevents double-close on subsequent calls)
    this.activeSessions.delete(active.session.taskId);
  }

  /**
   * Get the current session
   */
  getSession(): Session | null {
    const active = this.getActiveSessionFromContext();
    return active?.session ?? null;
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
      transcriptPath: row.transcriptPath ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      eventCount: row.eventCount ?? 0,
      messageCount: row.messageCount ?? 0,
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
      transcriptPath: row.transcriptPath ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      eventCount: row.eventCount ?? 0,
      messageCount: row.messageCount ?? 0,
    }));
  }

  /**
   * Write a message to the current session's transcript
   */
  writeTranscriptMessage(message: SdkMessage): void {
    const active = this.getActiveSessionFromContext();
    if (!active) {
      console.warn("No active session, cannot write transcript message");
      return;
    }
    active.transcriptWriter.write(message);
  }

  /**
   * Read transcript messages for a task
   */
  readTranscript(taskId: string, afterSeq = 0): SdkMessage[] {
    const session = this.getSessionByTaskId(taskId);
    if (!session) {
      return [];
    }

    // Use transcriptPath from database if available, otherwise compute it
    // This handles tasks created before the migration that don't have transcriptPath set
    const transcriptPath =
      session.transcriptPath || path.join(this.sessionsDir, `${taskId}.transcript.ndjson`);

    return TranscriptWriter.read(transcriptPath, afterSeq);
  }

  /**
   * Read transcript entries with metadata for a task
   */
  readTranscriptEntries(taskId: string, afterSeq = 0): TranscriptEntry[] {
    const session = this.getSessionByTaskId(taskId);
    if (!session) {
      return [];
    }

    // Use transcriptPath from database if available, otherwise compute it
    // This handles tasks created before the migration that don't have transcriptPath set
    const transcriptPath =
      session.transcriptPath || path.join(this.sessionsDir, `${taskId}.transcript.ndjson`);

    return TranscriptWriter.readEntries(transcriptPath, afterSeq);
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

// Singleton instance for oRPC contracts
let globalSessionManager: SessionManager | null = null;

/**
 * Get the global SessionManager instance
 * Used by oRPC contracts that need session access
 */
export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    // Initialize with default data directory
    globalSessionManager = new SessionManager(process.env.NIGHTSHIFT_DATA_DIR || "");
  }
  return globalSessionManager;
}

/**
 * Set the global SessionManager instance (called by TaskExecutor)
 */
export function setSessionManager(manager: SessionManager): void {
  globalSessionManager = manager;
}
