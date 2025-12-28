import type { ServerWebSocket, WebSocketHandler } from "bun";
import { type TerminalWsData, ptySessionManager } from "./pty-session";

interface TerminalMessage {
  type: "resize" | "ping";
  cols?: number;
  rows?: number;
}

function isTerminalMessage(data: unknown): data is TerminalMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data.type === "resize" || data.type === "ping")
  );
}

export const terminalWebSocketHandler: WebSocketHandler<TerminalWsData> = {
  open(ws: ServerWebSocket<TerminalWsData>) {
    const { cols, rows } = ws.data;
    const session = ptySessionManager.createSession(ws, cols, rows);
    ws.data.sessionId = session.id;
  },

  message(ws: ServerWebSocket<TerminalWsData>, message: string | Buffer) {
    const { sessionId } = ws.data;
    if (!sessionId) return;

    if (typeof message === "string") {
      // Try to parse as JSON control message
      try {
        const parsed = JSON.parse(message);
        if (isTerminalMessage(parsed)) {
          if (parsed.type === "resize" && parsed.cols && parsed.rows) {
            ptySessionManager.resize(sessionId, parsed.cols, parsed.rows);
          } else if (parsed.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
          return;
        }
      } catch {
        // Not JSON, treat as raw terminal input
      }

      ptySessionManager.write(sessionId, message);
    } else {
      ptySessionManager.write(sessionId, new Uint8Array(message));
    }
  },

  close(ws: ServerWebSocket<TerminalWsData>) {
    const { sessionId } = ws.data;
    if (sessionId) {
      ptySessionManager.close(sessionId);
    }
  },

  drain() {
    // Called when backpressure is relieved
  },
};
