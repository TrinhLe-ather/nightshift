import { type Serve, type Server } from "bun";

import webApp from "@/web/index.html";

import { openApiHandler, rpcHandler } from "../orpc/router";
import type { TerminalWsData } from "../terminal/pty-session";
import { terminalWebSocketHandler } from "../terminal/websocket-handler";
import { withMiddleware } from "./middleware";
import {
  pinAuthMiddleware,
  isLocalhost,
  hasValidAuthCookie,
  createAuthCookie,
} from "src/lan/middleware";
import { validatePin } from "src/lan/index";

/**
 * Create server options with dynamic hostname based on LAN config
 */
export function createServerOptions(allowLan: boolean) {
  return {
    hostname: allowLan ? "0.0.0.0" : "127.0.0.1",
    routes: {
      "/rpc/*": withMiddleware(pinAuthMiddleware(allowLan))(() => async (request: Request) => {
        const { matched, response } = await rpcHandler.handle(request, {
          prefix: "/rpc",
          context: {},
        });

        if (matched) {
          return response;
        }

        return new Response("Not found", { status: 404 });
      }),
      "/ws/terminal": async (request: Request, server: Server<TerminalWsData>) => {
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
      "/auth": (request: Request) => {
        // Localhost bypasses auth - redirect to home
        if (isLocalhost(request)) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/" },
          });
        }

        // Already authenticated - redirect to home
        if (hasValidAuthCookie(request)) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/" },
          });
        }

        // Check for PIN in query params
        const url = new URL(request.url);
        const pinParam = url.searchParams.get("pin");

        if (pinParam) {
          if (validatePin(pinParam)) {
            // Valid PIN - set cookie and redirect to home
            return new Response(null, {
              status: 302,
              headers: {
                Location: "/",
                "Set-Cookie": createAuthCookie(pinParam),
              },
            });
          }
          // Invalid PIN
          return Response.json(
            { ok: false, error: { code: "INVALID_PIN", message: "Invalid PIN" } },
            { status: 401 },
          );
        }

        // No PIN provided
        return Response.json(
          { ok: false, error: { code: "PIN_REQUIRED", message: "PIN required" } },
          { status: 401 },
        );
      },
      "/*": webApp,
    },
    websocket: terminalWebSocketHandler,
  } satisfies Serve.Options<TerminalWsData>;
}

// Default server options (localhost only, for backward compatibility)
export const serverOptions = createServerOptions(false);
