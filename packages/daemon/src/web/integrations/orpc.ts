import { type RouterClient } from "@orpc/server";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { OrpcRouter } from "@/orpc/router";
import { useLanAuthStore } from "@/web/stores/lanAuthStore";

const link = new RPCLink({
  url: `${window.location.origin}/rpc`,
  fetch: (request, init) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: "include",
    });
  },
  interceptors: [
    onError((error) => {
      // Check for LAN auth required error
      const err = error as { code?: string };
      if (err.code === "UNAUTHORIZED") {
        useLanAuthStore.getState().requireAuth();
        return;
      }
      console.error(error);
    }),
  ],
});

export const client: RouterClient<OrpcRouter> = createORPCClient(link);
