import { type Serve } from "bun";

import webApp from "@/web/index.html";

import { openApiHandler, rpcHandler } from "../orpc/router";

export const serverOptions = {
  hostname: "127.0.0.1",
  routes: {
    "/rpc/*": async (request) => {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/rpc",
        context: {}, // Provide initial context if needed
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    },
    "/reference": async (request) => {
      const { matched, response } = await openApiHandler.handle(request, {
        prefix: "/reference",
        context: {}, // Provide initial context if needed
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    },
    "/health": () => new Response("OK"),
    "/*": webApp,
  },
} satisfies Serve.Options<undefined>;
