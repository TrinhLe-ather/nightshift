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
import { TranscriptWriter, type TranscriptEntry } from "./transcript-writer";
import type { SdkMessage } from "./sdk";

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

export class SessionManager {
  private sessionsDir: string;
  private currentSession: Session | null = null;
  private eventSequence = 0;
  private writeStream: fs.WriteStream | null = null;
  private transcriptWriter: TranscriptWriter;

  constructor(dataDir: string) {
    this.sessionsDir = path.join(dataDir, "sessions");
    this.transcriptWriter = new TranscriptWriter(this.sessionsDir);
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

    // Start transcript writer and get path
    const transcriptPath = this.transcriptWriter.start(taskId);

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

    this.currentSession = {
      id: sessionId,
      taskId,
      runId,
      eventsPath,
      transcriptPath,
      startedAt,
      eventCount: 0,
      messageCount: 0,
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
   *
   * DEFENSIVE: Guards against double-close by checking if session exists.
   * Multiple calls to endSession are safe and will be ignored after the first.
   */
  endSession(): void {
    // Guard: Return early if session already ended (prevents double-close)
    if (!this.currentSession) return;

    const completedAt = new Date().toISOString();
    const messageCount = this.transcriptWriter.getSequence();

    // Emit session ended event
    this.emit(EventType.SESSION_ENDED, EventLevel.INFO, {
      duration: Date.now() - new Date(this.currentSession.startedAt).getTime(),
      eventCount: this.eventSequence,
      messageCount,
    });

    // Flush write stream before closing to ensure all events are persisted
    if (this.writeStream) {
      // Synchronous flush - ensure events are written before we continue
      try {
        this.writeStream.end();
        this.writeStream = null;
      } catch (error) {
        console.error("[SessionManager] Error closing write stream:", error);
      }
    }

    // Update session in database (after flush to ensure final event is written)
    const db = getDb();
    db.update(sessions)
      .set({
        completedAt,
        eventCount: this.eventSequence,
        messageCount,
      })
      .where(eq(sessions.id, this.currentSession.id))
      .run();

    // Close transcript writer
    try {
      this.transcriptWriter.close();
    } catch (error) {
      console.error("[SessionManager] Error closing transcript writer:", error);
    }

    // Clear session state (prevents double-close on subsequent calls)
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
    this.transcriptWriter.write(message);
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
    const transcriptPath = session.transcriptPath || path.join(this.sessionsDir, `${taskId}.transcript.ndjson`);

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
    const transcriptPath = session.transcriptPath || path.join(this.sessionsDir, `${taskId}.transcript.ndjson`);

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
    const dataDir = process.env.NIGHTSHIFT_DATA_DIR || "~/.nightshift";
    globalSessionManager = new SessionManager(dataDir);
  }
  return globalSessionManager;
}

/**
 * Set the global SessionManager instance (called by TaskExecutor)
 */
export function setSessionManager(manager: SessionManager): void {
  globalSessionManager = manager;
}
