import { type Serve, type Server } from "bun";

import webApp from "@/web/index.html";

import { openApiHandler, rpcHandler } from "../orpc/router";
import type { TerminalWsData } from "../terminal/pty-session";
import { terminalWebSocketHandler } from "../terminal/websocket-handler";
import { pinAuthMiddleware } from "../lan/middleware";

let allowLanMode = false;

/**
 * Create server options with dynamic hostname based on LAN config
 */
export function createServerOptions(allowLan: boolean) {
  // Store for the fetch middleware
  allowLanMode = allowLan;

  return {
    hostname: allowLan ? "0.0.0.0" : "127.0.0.1",
    fetch(request: Request) {
      // Check PIN auth first for LAN connections
      const authResponse = pinAuthMiddleware(request, allowLanMode);
      if (authResponse) return authResponse;
      // Return undefined to let routes handle the request
      return undefined;
    },
    routes: {
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
}

// Default server options (localhost only, for backward compatibility)
export const serverOptions = createServerOptions(false);
