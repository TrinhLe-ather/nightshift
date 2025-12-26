/**
 * Transcript Writer
 *
 * Writes full SDK messages to NDJSON file for persistence.
 * Used to preserve complete task output after execution completes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SdkMessage } from "./sdk";

export interface TranscriptEntry {
  seq: number;
  ts: string;
  message: SdkMessage;
}

export class TranscriptWriter {
  private writeStream: fs.WriteStream | null = null;
  private sequence = 0;
  private transcriptPath: string | null = null;

  constructor(private sessionsDir: string) {}

  /**
   * Start writing transcript for a task
   */
  start(taskId: string): string {
    this.transcriptPath = path.join(this.sessionsDir, `${taskId}.transcript.ndjson`);
    // Resume sequence if file already exists (e.g. initial prompt written at task creation)
    this.sequence = TranscriptWriter.getLastSeq(this.transcriptPath);

    // Open write stream (append mode in case of resume)
    this.writeStream = fs.createWriteStream(this.transcriptPath, { flags: "a" });

    return this.transcriptPath;
  }

  /**
   * Write a message to the transcript
   */
  write(message: SdkMessage): void {
    if (!this.writeStream) {
      console.warn("TranscriptWriter: No active stream, cannot write message");
      return;
    }

    const entry: TranscriptEntry = {
      seq: ++this.sequence,
      ts: new Date().toISOString(),
      message,
    };

    this.writeStream.write(JSON.stringify(entry) + "\n");
  }

  /**
   * Close the transcript file
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.transcriptPath = null;
    this.sequence = 0;
  }

  /**
   * Get current transcript path
   */
  getPath(): string | null {
    return this.transcriptPath;
  }

  /**
   * Get current sequence number
   */
  getSequence(): number {
    return this.sequence;
  }

  /**
   * Read transcript from file
   */
  static read(transcriptPath: string, afterSeq = 0): SdkMessage[] {
    if (!fs.existsSync(transcriptPath)) {
      return [];
    }

    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const messages: SdkMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.seq > afterSeq) {
          messages.push(entry.message);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return messages;
  }

  /**
   * Read transcript entries with metadata
   */
  static readEntries(transcriptPath: string, afterSeq = 0): TranscriptEntry[] {
    if (!fs.existsSync(transcriptPath)) {
      return [];
    }

    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const entries: TranscriptEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.seq > afterSeq) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /**
   * Get the last sequence number in a transcript file (0 if missing/empty).
   */
  static getLastSeq(transcriptPath: string): number {
    if (!fs.existsSync(transcriptPath)) return 0;
    try {
      const content = fs.readFileSync(transcriptPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return 0;
      // Walk backwards for the last valid entry
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]!) as Partial<TranscriptEntry>;
          if (typeof entry.seq === "number" && Number.isFinite(entry.seq)) {
            return entry.seq;
          }
        } catch {
          // keep scanning backwards
        }
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Append a message to a transcript file without requiring an active session.
   * Useful for writing the initial task prompt at creation time.
   */
  static appendMessage(transcriptPath: string, message: SdkMessage, ts?: string): TranscriptEntry {
    const dir = path.dirname(transcriptPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const lastSeq = TranscriptWriter.getLastSeq(transcriptPath);
    const entry: TranscriptEntry = {
      seq: lastSeq + 1,
      ts: ts ?? new Date().toISOString(),
      message,
    };

    fs.appendFileSync(transcriptPath, JSON.stringify(entry) + "\n", "utf-8");
    return entry;
  }
}
