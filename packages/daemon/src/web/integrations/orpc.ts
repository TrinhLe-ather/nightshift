import { type RouterClient } from "@orpc/server";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { OrpcRouter } from "@/orpc/router";

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
      console.error(error);
    }),
  ],
});

export const client: RouterClient<OrpcRouter> = createORPCClient(link);
