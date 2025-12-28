import type { ServerWebSocket } from "bun";
import { spawn, type IPty } from "bun-pty";
import { loadConfig } from "../config";
import { resolveShell } from "./shells";

export interface PtySession {
  id: string;
  pty: IPty;
  cols: number;
  rows: number;
  createdAt: Date;
  dataDisposer?: { dispose: () => void };
  exitDisposer?: { dispose: () => void };
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

    // Get configured shell
    const config = loadConfig();
    const shell = resolveShell(config.terminalShell);

    // Get home directory
    const isWindows = process.platform === "win32";
    const homeDir = isWindows ? process.env.USERPROFILE : process.env.HOME;

    const pty = spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: homeDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    // Handle PTY output - send to WebSocket
    const dataDisposer = pty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle PTY exit - close WebSocket
    const exitDisposer = pty.onExit(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      this.sessions.delete(id);
    });

    const session: PtySession = {
      id,
      pty,
      cols,
      rows,
      createdAt: new Date(),
      dataDisposer,
      exitDisposer,
    };

    this.sessions.set(id, session);
    return session;
  }

  write(sessionId: string, data: string | Uint8Array): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // bun-pty write accepts string
    const str = typeof data === "string" ? data : new TextDecoder().decode(data);
    session.pty.write(str);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cols = cols;
      session.rows = rows;
      session.pty.resize(cols, rows);
    }
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clean up event listeners
      session.dataDisposer?.dispose();
      session.exitDisposer?.dispose();
      // Kill the PTY process
      session.pty.kill();
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
