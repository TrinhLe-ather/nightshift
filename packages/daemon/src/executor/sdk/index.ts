/**
 * SDK Executor Module
 *
 * Claude Agent SDK v2 types.
 *
 * NOTE: Interactive execution via SdkRunner is deprecated; workflows use
 * StreamingWorkflowRunner instead.
 */

export interface SdkMessage {
  type: "system" | "assistant" | "tool" | "result" | "error" | "user";
  timestamp: string;
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  sessionId?: string;
}
