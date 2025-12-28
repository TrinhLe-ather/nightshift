import type { ServerWebSocket } from "bun";

export interface PtySession {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
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
      ? process.env.COMSPEC || "cmd.exe"
      : process.env.SHELL || "/bin/bash";

    // Get home directory
    const homeDir = isWindows ? process.env.USERPROFILE : process.env.HOME;

    const proc = Bun.spawn([shell], {
      terminal: {
        cols,
        rows,
        data(_terminal, data) {
          // Send PTY output to WebSocket as binary
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

    const session: PtySession = {
      id,
      proc,
      cols,
      rows,
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    return session;
  }

  write(sessionId: string, data: string | Uint8Array): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Use proc.terminal.write() directly (Bun v1.3.5+)
    session.proc.terminal?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cols = cols;
      session.rows = rows;
      // Use Bun's native PTY resize API (Bun v1.3.5+)
      session.proc.terminal?.resize(cols, rows);
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
