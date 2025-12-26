/**
 * SDK Runner
 *
 * Executes tasks using Claude Agent SDK.
 * Uses the query() API which provides full control over execution options.
 */

import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { EventLevel, EventType } from "@nightshift/shared";
import type { SessionManager } from "../session-manager";
import { streamEventBus } from "../../streaming/event-bus";

export interface SdkRunnerOptions {
  /** The prompt to send to Claude */
  prompt: string;
  /** Working directory for Claude (worktree path or repo path) */
  workDir: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Model to use (default: sonnet) */
  model?: string;
  /** Session ID for resuming a previous session */
  sdkSessionId?: string;
  /** Permission mode (default: acceptEdits for auto-yes behavior) */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  /** Enable file checkpointing */
  enableCheckpointing?: boolean;
}

export interface SdkMessage {
  type: "system" | "assistant" | "tool" | "result" | "error" | "user";
  timestamp: string;
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  sessionId?: string;
}

export interface SdkRunResult {
  success: boolean;
  /** SDK session ID for future resume */
  sdkSessionId?: string;
  /** All messages received during execution */
  messages: SdkMessage[];
  /** Formatted text output */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Human input needed */
  needsHuman?: {
    code: string;
    question: string;
  };
  /** Token usage and cost */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  /** First checkpoint UUID (if checkpointing enabled) */
  checkpointId?: string;
  /** All checkpoint UUIDs (if checkpointing enabled) */
  checkpoints?: string[];
}

export class SdkRunner {
  private aborted = false;
  private messages: SdkMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(private sessionManager: SessionManager) {}

  /**
   * Run a task with Claude Agent SDK
   */
  async run(options: SdkRunnerOptions): Promise<SdkRunResult> {
    const {
      prompt,
      workDir,
      timeout,
      model = "sonnet",
      sdkSessionId,
      permissionMode = "acceptEdits",
      enableCheckpointing,
    } = options;

    this.aborted = false;
    this.messages = [];
    this.abortController = new AbortController();

    this.sessionManager.emit(EventType.AGENT_STARTED, EventLevel.INFO, {
      prompt: prompt.substring(0, 200),
      workDir,
      model,
      isResume: !!sdkSessionId,
    });

    try {
      return await this.executeQuery(prompt, workDir, timeout, model, sdkSessionId, permissionMode, enableCheckpointing);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
        error: message,
      });

      // Emit streaming events for error
      if (this.sessionManager.taskId) {
        streamEventBus.emitTyping(this.sessionManager.taskId, false);
        streamEventBus.emitError(this.sessionManager.taskId, message);
      }

      return {
        success: false,
        messages: this.messages,
        error: message,
      };
    }
  }

  private async executeQuery(
    prompt: string,
    workDir: string,
    timeout: number,
    model: string,
    sdkSessionId?: string,
    permissionMode?: Options["permissionMode"],
    enableCheckpointing?: boolean,
  ): Promise<SdkRunResult> {
    let newSdkSessionId: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let checkpointId: string | undefined;
    const checkpoints: string[] = [];

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.abort();
    }, timeout);

    // Emit typing indicator when starting
    if (this.sessionManager.taskId) {
      streamEventBus.emitTyping(this.sessionManager.taskId, true);
    }

    try {
      // Build query options
      const queryOptions: Options = {
        cwd: workDir,
        model,
        permissionMode,
        abortController: this.abortController ?? undefined,
      };

      // Add resume option if we have a session ID
      if (sdkSessionId) {
        queryOptions.resume = sdkSessionId;
      }

      // Configure checkpointing if enabled
      if (enableCheckpointing) {
        queryOptions.enableFileCheckpointing = true;
        queryOptions.extraArgs = {
          "replay-user-messages": null,
        };
        // Set environment variable for SDK file checkpointing
        if (typeof process !== "undefined" && process.env) {
          process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = "1";
        }
      }

      // Create the query
      const queryIterator = query({
        prompt,
        options: queryOptions,
      });

      // Process messages from the query
      for await (const msg of queryIterator) {
        if (this.aborted) break;

        const sdkMessage = this.processMessage(msg);
        if (sdkMessage) {
          this.messages.push(sdkMessage);
          // Write to transcript for persistence
          this.sessionManager.writeTranscriptMessage(sdkMessage);

          // Emit to stream bus for real-time updates
          if (this.sessionManager.taskId) {
            streamEventBus.emitMessage(this.sessionManager.taskId, sdkMessage);
          }
        }

        // Extract session ID from init message
        if (msg.type === "system" && (msg as SDKSystemMessage).subtype === "init") {
          newSdkSessionId = msg.session_id;
          if (sdkMessage) {
            sdkMessage.sessionId = newSdkSessionId;
          }
        }

        // Extract checkpoint UUIDs from user messages if checkpointing is enabled
        if (enableCheckpointing && msg.type === "user") {
          const checkpointUuid = this.extractCheckpointId(msg);
          if (checkpointUuid) {
            checkpoints.push(checkpointUuid);
            if (!checkpointId) {
              checkpointId = checkpointUuid;
            }
          }
        }

        // Track usage from result message
        if (msg.type === "result") {
          const resultMsg = msg as SDKResultMessage;
          totalInputTokens = resultMsg.usage?.input_tokens ?? 0;
          totalOutputTokens = resultMsg.usage?.output_tokens ?? 0;
          totalCost = resultMsg.total_cost_usd ?? 0;

          // Check for error results
          if (resultMsg.subtype !== "success") {
            // Error result has an errors array
            const errors =
              "errors" in resultMsg ? (resultMsg as { errors?: string[] }).errors : undefined;
            return {
              success: false,
              sdkSessionId: newSdkSessionId,
              messages: this.messages,
              error: errors?.join(", ") || resultMsg.subtype,
              needsHuman:
                resultMsg.subtype === "error_max_turns"
                  ? { code: "NEEDS_HUMAN_MAX_TURNS", question: "Maximum turns reached" }
                  : undefined,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                totalCost,
              },
              ...(enableCheckpointing && { checkpointId, checkpoints: checkpoints.length > 0 ? checkpoints : undefined }),
            };
          }
        }
      }

      // Check if aborted
      if (this.aborted) {
        // Emit error for abort
        if (this.sessionManager.taskId) {
          streamEventBus.emitTyping(this.sessionManager.taskId, false);
          streamEventBus.emitError(this.sessionManager.taskId, "Task execution timed out or was aborted");
        }

        return {
          success: false,
          sdkSessionId: newSdkSessionId,
          messages: this.messages,
          error: "Task execution timed out or was aborted",
          ...(enableCheckpointing && { checkpointId, checkpoints: checkpoints.length > 0 ? checkpoints : undefined }),
        };
      }

      // Emit completion/stop typing on success
      if (this.sessionManager.taskId) {
        streamEventBus.emitTyping(this.sessionManager.taskId, false);
        streamEventBus.emitComplete(this.sessionManager.taskId);
      }

      return {
        success: true,
        sdkSessionId: newSdkSessionId,
        messages: this.messages,
        output: this.getFormattedOutput(),
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalCost,
        },
        ...(enableCheckpointing && { checkpointId, checkpoints: checkpoints.length > 0 ? checkpoints : undefined }),
      };
    } catch (error) {
      // Emit error
      if (this.sessionManager.taskId) {
        streamEventBus.emitTyping(this.sessionManager.taskId, false);
        streamEventBus.emitError(
          this.sessionManager.taskId,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  /**
   * Extract checkpoint UUID from user message metadata
   */
  private extractCheckpointId(msg: SDKMessage): string | undefined {
    // Check for checkpoint_id in the message metadata
    if ("checkpoint_id" in msg && typeof msg.checkpoint_id === "string") {
      return msg.checkpoint_id;
    }

    // Alternative: check in message structure
    if ("metadata" in msg && msg.metadata && typeof msg.metadata === "object") {
      const metadata = msg.metadata as Record<string, unknown>;
      if ("checkpoint_id" in metadata && typeof metadata.checkpoint_id === "string") {
        return metadata.checkpoint_id;
      }
    }

    return undefined;
  }

  /**
   * Process an SDK message and convert to SdkMessage format
   */
  private processMessage(msg: SDKMessage): SdkMessage | null {
    const timestamp = new Date().toISOString();

    switch (msg.type) {
      case "system": {
        const sysMsg = msg as SDKSystemMessage;
        if (sysMsg.subtype === "init") {
          return {
            type: "system",
            timestamp,
            content: `Session initialized (model: ${sysMsg.model})`,
          };
        }
        return null;
      }

      case "assistant": {
        const assistantMsg = msg as SDKAssistantMessage;
        const content = assistantMsg.message?.content;
        if (!content || !Array.isArray(content)) {
          return null;
        }

        // Check for tool calls
        const toolUse = content.find(
          (c): c is { type: "tool_use"; name: string; input: unknown } => c.type === "tool_use",
        );
        if (toolUse) {
          this.sessionManager.emit(EventType.AGENT_TOOL_CALL, EventLevel.DEBUG, {
            tool: toolUse.name,
            args: JSON.stringify(toolUse.input).substring(0, 500),
          });

          return {
            type: "assistant",
            timestamp,
            content: "",
            toolName: toolUse.name,
            toolArgs: toolUse.input,
          };
        }

        // Extract text content
        const textContent = content.find(
          (c): c is { type: "text"; text: string } => c.type === "text" && "text" in c,
        );
        if (textContent) {
          this.sessionManager.emit(EventType.AGENT_MESSAGE, EventLevel.INFO, {
            content: textContent.text.substring(0, 200),
          });

          return {
            type: "assistant",
            timestamp,
            content: textContent.text,
          };
        }

        return null;
      }

      case "user": {
        // Tool results come as user messages
        const userMsg = msg as { message?: { content?: unknown[] } };
        const content = userMsg.message?.content;
        if (content && Array.isArray(content)) {
          const toolResult = content.find(
            (c): c is { type: "tool_result"; content: string } =>
              (c as { type?: string }).type === "tool_result",
          );
          if (toolResult) {
            this.sessionManager.emit(EventType.AGENT_TOOL_RESULT, EventLevel.DEBUG, {
              result: String(toolResult.content || "").substring(0, 200),
            });

            return {
              type: "tool",
              timestamp,
              content: "",
              toolResult: String(toolResult.content || ""),
            };
          }
        }
        return null;
      }

      case "result": {
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.subtype === "success") {
          return {
            type: "result",
            timestamp,
            content: resultMsg.result || "Task completed",
          };
        }
        return {
          type: "error",
          timestamp,
          content: `Error: ${resultMsg.subtype}`,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Get formatted text output from all messages
   */
  private getFormattedOutput(): string {
    return this.messages
      .filter((m) => m.type === "assistant" && m.content)
      .map((m) => m.content)
      .join("\n\n");
  }

  /**
   * Get all messages for terminal preview (structured format)
   */
  getMessages(): SdkMessage[] {
    return [...this.messages];
  }

  /**
   * Get formatted text output (for legacy compatibility)
   */
  getCurrentOutput(): string {
    return this.messages
      .map((m) => {
        switch (m.type) {
          case "assistant":
            if (m.toolName) {
              return `[Tool: ${m.toolName}]\n${m.content || ""}`;
            }
            return m.content;
          case "tool":
            return `[Result] ${m.toolResult?.substring(0, 200) || ""}`;
          case "error":
            return `[Error] ${m.content}`;
          case "result":
            return `[Complete] ${m.content}`;
          default:
            return "";
        }
      })
      .filter(Boolean)
      .join("\n\n");
  }

  /**
   * Check if currently running
   */
  isRunning(): boolean {
    return this.abortController !== null && !this.aborted;
  }

  /**
   * Abort the current execution
   */
  abort(): void {
    this.aborted = true;
    this.abortController?.abort();
  }
}
