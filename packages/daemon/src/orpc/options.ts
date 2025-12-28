import { type Serve, type Server } from "bun";

import webApp from "@/web/index.html";

import { openApiHandler, rpcHandler } from "../orpc/router";
import type { TerminalWsData } from "../terminal/pty-session";
import { terminalWebSocketHandler } from "../terminal/websocket-handler";

export const serverOptions = {
  hostname: "127.0.0.1",
  routes: {
    "/ws/terminal": (request: Request, server: Server<TerminalWsData>) => {
      const url = new URL(request.url);
      const cols = Number.parseInt(url.searchParams.get("cols") || "80", 10);
      const rows = Number.parseInt(url.searchParams.get("rows") || "24", 10);

      const upgraded = server.upgrade(request, {
        data: { sessionId: "", cols, rows },
      });

      if (upgraded) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    },
    "/rpc/*": async (request: Request) => {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/rpc",
        context: {},
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    },
    "/reference": async (request: Request) => {
      const { matched, response } = await openApiHandler.handle(request, {
        prefix: "/reference",
        context: {},
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    },
    "/health": () => new Response("OK"),
    "/*": webApp,
  },
  websocket: terminalWebSocketHandler,
} satisfies Serve.Options<TerminalWsData>;
