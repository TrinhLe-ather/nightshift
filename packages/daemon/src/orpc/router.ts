import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { statusRouter } from "./contracts/status";
import { configRouter } from "./contracts/config";
import { tasksRouter } from "./contracts/tasks";
import { sessionsRouter } from "./contracts/sessions";
import { reposRouter } from "./contracts/repos";
import { updateRouter } from "./contracts/update";
import {
  terminalRouter,
  setTerminalOutputProvider,
  setTerminalMessagesProvider,
  setTranscriptReader,
} from "./contracts/terminal";
import { workflowsRouter } from "./contracts/workflows";
import { streamRouter } from "./contracts/stream";

const router = {
  status: statusRouter,
  config: configRouter,
  tasks: tasksRouter,
  sessions: sessionsRouter,
  repos: reposRouter,
  update: updateRouter,
  terminal: terminalRouter,
  workflows: workflowsRouter,
  stream: streamRouter,
};

// Re-export for server setup
export { setTerminalOutputProvider, setTerminalMessagesProvider, setTranscriptReader };

function logOrpcError(error: unknown) {
  // Keep logs concise and avoid dumping potentially sensitive `.data` wholesale.
  if (error && typeof error === "object") {
    const maybeCode = (error as { code?: unknown }).code;
    const code = typeof maybeCode === "string" ? maybeCode : undefined;
    const message = error instanceof Error ? error.message : undefined;

    console.error("[oRPC] request failed", { code, message });
    if (error instanceof Error && error.stack) console.error(error.stack);
    return;
  }

  console.error("[oRPC] request failed", error);
}

export const openApiHandler = new OpenAPIHandler(router, {
  plugins: [
    new CORSPlugin({
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [onError(logOrpcError)],
});

export const rpcHandler = new RPCHandler(router, {
  // Streaming (SSE / event iterators)
  // Keep connections alive with comments (replaces custom heartbeat events).
  eventIteratorInitialCommentEnabled: true,
  eventIteratorInitialComment: "start",
  eventIteratorKeepAliveEnabled: true,
  eventIteratorKeepAliveInterval: 15000,
  eventIteratorKeepAliveComment: "",
  plugins: [
    new CORSPlugin({
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  ],
  interceptors: [onError(logOrpcError)],
});

export type OrpcRouter = typeof router;
