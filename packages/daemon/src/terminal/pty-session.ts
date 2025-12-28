import type { ServerWebSocket } from "bun";

type TerminalWriter = { write: (data: string | Uint8Array) => void };

export interface PtySession {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
  terminalRef: TerminalWriter | null;
  pendingWrites: (string | Uint8Array)[];
  cols: number;
  rows: number;
  createdAt: Date;
}

export interface TerminalWsData {
  sessionId: string;
  cols: number;
  rows: number;
}

class PtySessionManager {
  private sessions = new Map<string, PtySession>();

  createSession(ws: ServerWebSocket<TerminalWsData>, cols: number, rows: number): PtySession {
    const id = crypto.randomUUID();

    // Detect shell based on platform
    const isWindows = process.platform === "win32";
    const shell = isWindows
      ? process.env.COMSPEC || "cmd.exe" // Windows: use COMSPEC or default to cmd.exe
      : process.env.SHELL || "/bin/bash"; // Unix: use SHELL or default to bash

    // Create session object first so we can reference it in the callback
    const session: PtySession = {
      id,
      proc: null as unknown as ReturnType<typeof Bun.spawn>,
      terminalRef: null,
      pendingWrites: [],
      cols,
      rows,
      createdAt: new Date(),
    };

    // Store session before spawning so it's available in callback
    this.sessions.set(id, session);

    // Get home directory (different env var on Windows)
    const homeDir = isWindows ? process.env.USERPROFILE : process.env.HOME;

    const proc = Bun.spawn([shell], {
      terminal: {
        cols,
        rows,
        data(terminal, data) {
          // Store terminal reference on first callback
          if (!session.terminalRef) {
            session.terminalRef = terminal;

            // Flush any pending writes
            for (const pendingData of session.pendingWrites) {
              terminal.write(pendingData);
            }
            session.pendingWrites = [];
          }

          // Send PTY output to WebSocket
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        },
      },
      cwd: homeDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    session.proc = proc;
    return session;
  }

  write(sessionId: string, data: string | Uint8Array): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.terminalRef) {
      session.terminalRef.write(data);
    } else {
      session.pendingWrites.push(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cols = cols;
      session.rows = rows;
    }
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.proc.kill();
      this.sessions.delete(sessionId);
    }
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}

export const ptySessionManager = new PtySessionManager();
