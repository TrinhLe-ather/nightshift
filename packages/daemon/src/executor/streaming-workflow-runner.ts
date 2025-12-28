/**
 * Streaming Workflow Runner
 *
 * Executes workflow steps in a single continuous Claude session using
 * the SDK's streaming input mode with AsyncGenerator.
 *
 * Benefits over per-step sessions:
 * - Full conversation context preserved across all steps
 * - Tool call history and file read memory maintained
 * - More efficient token usage
 * - More coherent multi-step reasoning
 */

import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { Task } from "@/db/drizzle";
import { EventLevel, EventType } from "@nightshift/shared";
import type { SessionManager } from "./session-manager";
import type { WorkflowStep, WorkflowDefinition } from "../workflows/loader";
import { streamEventBus } from "../streaming/event-bus";
import { isRepoDirty } from "../repo/git";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowStepResult {
  stepName: string;
  output: string;
  success: boolean;
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface StreamingWorkflowOptions {
  task: Task;
  steps: WorkflowStep[];
  workflow: WorkflowDefinition;
  workDir: string;
  timeout: number;
  onStepStarted?: (stepIndex: number, stepName: string) => void;
  onStepCompleted?: (stepIndex: number, result: WorkflowStepResult) => void;
  onStepFailed?: (stepIndex: number, error: string) => void;
}

export interface StreamingWorkflowResult {
  success: boolean;
  sdkSessionId?: string;
  stepResults: Map<string, WorkflowStepResult>;
  error?: string;
}

/**
 * User message format for streaming input.
 * Note: The SDK accepts a simplified format for streaming input
 * that doesn't require all SDKUserMessage fields.
 */
type StreamingUserMessage = {
  type: "user";
  message: {
    role: "user";
    content: string;
  };
  parent_tool_use_id: null;
};

interface SdkMessage {
  type: "system" | "assistant" | "tool" | "result" | "error" | "user";
  timestamp: string;
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  sessionId?: string;
}

// ============================================================================
// StreamingWorkflowRunner
// ============================================================================

export class StreamingWorkflowRunner {
  private abortController: AbortController | null = null;
  private currentStepIndex = 0;
  private stepResults: Map<string, WorkflowStepResult> = new Map();
  private stepCompletionResolver: (() => void) | null = null;
  private currentStepMessages: SdkMessage[] = [];
  private currentStepStartTime: string | null = null;
  private options: StreamingWorkflowOptions | null = null;
  private workflowTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private stepTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentStepTimedOut = false;

  // Query iterator for dynamic model changes
  private queryIteratorPromise: Promise<Query> | null = null;
  private queryIteratorResolver: ((q: Query) => void) | null = null;

  constructor(private sessionManager: SessionManager) {}

  /**
   * Execute all workflow steps in a single streaming session
   */
  async executeWorkflow(options: StreamingWorkflowOptions): Promise<StreamingWorkflowResult> {
    this.options = options;
    this.stepResults = new Map();
    this.abortController = new AbortController();
    this.currentStepIndex = 0;
    this.currentStepMessages = [];

    const { task, steps, workflow, workDir, timeout } = options;
    const taskId = task.id;

    let sdkSessionId: string | undefined;

    // Set up workflow timeout
    this.workflowTimeoutId = setTimeout(() => {
      console.warn(`[StreamingWorkflow] Workflow timed out after ${timeout}ms`);
      this.abort();
    }, timeout);

    // Create a promise that will be resolved with the query iterator
    // This allows the generator to access it for dynamic model changes
    this.queryIteratorPromise = new Promise<Query>((resolve) => {
      this.queryIteratorResolver = resolve;
    });

    try {
      const queryOptions: Options = {
        cwd: workDir,
        model: this.resolveWorkflowModel(task, workflow),
        // Use bypassPermissions for fully automated workflow execution
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController: this.abortController,
        enableFileCheckpointing: true,
        // Resume existing Claude session if continuing a task
        ...(task.sdkSessionId && { resume: task.sdkSessionId }),
      };

      // Emit typing indicator
      streamEventBus.emitTyping(taskId, true);

      // Create single query with streaming input generator
      // Cast to SDKUserMessage since the SDK accepts the simplified format at runtime
      const messageGenerator = this.generateWorkflowMessages(
        steps,
        workflow,
        task,
      ) as AsyncGenerator<SDKUserMessage, void, unknown>;
      const queryIterator = query({
        prompt: messageGenerator,
        options: queryOptions,
      });

      // Resolve the promise so the generator can use setModel()
      this.queryIteratorResolver?.(queryIterator);

      // Process all messages from the single session
      for await (const msg of queryIterator) {
        if (this.abortController.signal.aborted) break;

        // Extract session ID from init message
        if (msg.type === "system" && (msg as SDKSystemMessage).subtype === "init") {
          sdkSessionId = msg.session_id;
        }

        // Process and store message
        const sdkMessage = this.processMessage(msg);
        if (sdkMessage) {
          this.currentStepMessages.push(sdkMessage);
          this.sessionManager.writeTranscriptMessage(sdkMessage);

          // Emit to stream bus for real-time updates
          streamEventBus.emitMessage(taskId, sdkMessage);
        }

        // Check for step completion marker
        const currentStep = steps[this.currentStepIndex];
        if (currentStep && this.detectStepCompletion(msg, currentStep.name)) {
          this.completeCurrentStep(currentStep);
        }

        // Check for errors in result messages
        if (msg.type === "result") {
          const resultMsg = msg as SDKResultMessage;
          if (resultMsg.subtype !== "success") {
            const currentStep = steps[this.currentStepIndex];
            if (currentStep) {
              this.failCurrentStep(currentStep, resultMsg.subtype);
            }
            break;
          }
        }
      }

      // Stop typing indicator
      streamEventBus.emitTyping(taskId, false);

      // Check if aborted
      if (this.abortController.signal.aborted) {
        streamEventBus.emitError(taskId, "Workflow execution timed out or was aborted");
        return {
          success: false,
          sdkSessionId,
          stepResults: this.stepResults,
          error: "Workflow execution timed out or was aborted",
        };
      }

      // Check if all steps completed
      const allCompleted = this.allStepsCompleted(steps);

      if (allCompleted) streamEventBus.emitComplete(taskId);

      return {
        success: allCompleted,
        sdkSessionId,
        stepResults: this.stepResults,
        error: allCompleted ? undefined : "Not all steps completed",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      streamEventBus.emitTyping(taskId, false);
      streamEventBus.emitError(taskId, message);

      return {
        success: false,
        sdkSessionId, // Include session ID so task can be continued even after failure
        stepResults: this.stepResults,
        error: message,
      };
    } finally {
      this.clearTimeouts();
      this.abortController = null;
    }
  }

  /**
   * AsyncGenerator that yields step prompts as user messages
   * Supports dynamic model changes per step via setModel()
   * All steps run in a single session with full conversation context preserved.
   */
  private async *generateWorkflowMessages(
    steps: WorkflowStep[],
    workflow: WorkflowDefinition,
    task: Task,
  ): AsyncGenerator<StreamingUserMessage, void, unknown> {
    // Wait for the query iterator to be available for setModel() calls
    const queryIterator = await this.queryIteratorPromise!;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      this.currentStepIndex = i;
      this.currentStepMessages = [];
      this.currentStepStartTime = new Date().toISOString();
      this.currentStepTimedOut = false;

      // Skip Smart Commit step if working directory is clean
      if (step.name === "Smart Commit") {
        const workDir = this.options?.workDir || process.cwd();
        const isDirty = await isRepoDirty(workDir).catch(() => false);
        if (!isDirty) {
          console.log(`[StreamingWorkflow] Skipping "${step.name}" - working directory is clean`);
          // Mark step as completed (skipped) and continue
          const result: WorkflowStepResult = {
            stepName: step.name,
            output: "Skipped: no changes to commit",
            success: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
          this.stepResults.set(step.name, result);
          this.options?.onStepCompleted?.(i, result);
          continue;
        }
      }

      // Resolve model for this step (step -> task -> workflow -> default)
      const stepModel = this.resolveStepModel(step, task, workflow);

      // Dynamically change model for this step if specified
      try {
        await queryIterator.setModel(stepModel);
        console.log(`[StreamingWorkflow] Step "${step.name}" using model: ${stepModel}`);
      } catch (error) {
        console.warn(`[StreamingWorkflow] Failed to set model for step "${step.name}":`, error);
      }

      // Build step prompt with completion marker (interpolates {{prompt}})
      const prompt = this.buildStepPrompt(step, task.prompt);

      // Emit step started event
      this.options?.onStepStarted?.(i, step.name);

      // Set up per-step timeout (10 minutes default)
      this.resetStepTimeout(step);

      // Write user message to transcript before yielding to SDK
      const userMessage: SdkMessage = {
        type: "user",
        timestamp: new Date().toISOString(),
        content: prompt,
      };
      this.sessionManager.writeTranscriptMessage(userMessage);
      streamEventBus.emitMessage(task.id, userMessage);

      // Yield the step prompt as a user message
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: prompt,
        },
        parent_tool_use_id: null,
      };

      // Wait for step completion (resolved by message processor)
      await new Promise<void>((resolve) => {
        this.stepCompletionResolver = resolve;
      });

      // Clear step timeout
      if (this.stepTimeoutId) {
        clearTimeout(this.stepTimeoutId);
        this.stepTimeoutId = null;
      }

      // Check if step failed or timed out
      const result = this.stepResults.get(step.name);
      if (result && !result.success) {
        // Stop yielding more steps on failure
        return;
      }
    }
  }

  /**
   * Resolve model for a specific step
   * Priority: step.model > task.model > workflow.model > "sonnet"
   */
  private resolveStepModel(step: WorkflowStep, task: Task, workflow: WorkflowDefinition): string {
    return step.model || task.model || workflow.model || "sonnet";
  }

  /**
   * Build step prompt with completion marker
   * Interpolates {{prompt}} with the task prompt
   */
  private buildStepPrompt(step: WorkflowStep, taskPrompt: string): string {
    // Only {{prompt}} is supported for interpolation
    const interpolated = step.prompt.replace(/\{\{prompt\}\}/g, taskPrompt);

    return `${interpolated}

---
IMPORTANT: When you have completed this step, output exactly:
[STEP_COMPLETE: ${step.name}]
followed by a brief summary of what was accomplished.`;
  }

  /**
   * Detect step completion marker in message
   */
  private detectStepCompletion(msg: SDKMessage, expectedStepName: string): boolean {
    if (msg.type === "assistant") {
      const assistantMsg = msg as SDKAssistantMessage;
      const content = assistantMsg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block.type === "text" &&
            "text" in block &&
            typeof block.text === "string" &&
            block.text.includes(`[STEP_COMPLETE: ${expectedStepName}]`)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Complete the current step
   */
  private completeCurrentStep(step: WorkflowStep): void {
    const output = this.extractStepOutput();
    const result: WorkflowStepResult = {
      stepName: step.name,
      output,
      success: true,
      startedAt: this.currentStepStartTime || new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    this.stepResults.set(step.name, result);
    this.options?.onStepCompleted?.(this.currentStepIndex, result);

    // Signal generator to proceed to next step
    this.stepCompletionResolver?.();
    this.stepCompletionResolver = null;
  }

  /**
   * Fail the current step
   */
  private failCurrentStep(step: WorkflowStep, error: string): void {
    const result: WorkflowStepResult = {
      stepName: step.name,
      output: "",
      success: false,
      error,
      startedAt: this.currentStepStartTime || new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    this.stepResults.set(step.name, result);
    this.options?.onStepFailed?.(this.currentStepIndex, error);

    // Signal generator to stop
    this.stepCompletionResolver?.();
    this.stepCompletionResolver = null;
  }

  /**
   * Extract output from current step messages
   */
  private extractStepOutput(): string {
    // Collect text content from assistant messages
    const textContent = this.currentStepMessages
      .filter((m) => m.type === "assistant" && m.content)
      .map((m) => m.content)
      .join("\n\n");

    // Remove the step completion marker from output
    return textContent.replace(/\[STEP_COMPLETE:[^\]]+\]/g, "").trim();
  }

  /**
   * Process SDK message and convert to internal format
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
   * Resolve workflow model (task -> workflow -> default)
   */
  private resolveWorkflowModel(task: Task, workflow: WorkflowDefinition): string {
    return task.model || workflow.model || "sonnet";
  }

  /**
   * Check if all steps completed successfully
   */
  private allStepsCompleted(steps: WorkflowStep[]): boolean {
    return steps.every((step) => {
      const result = this.stepResults.get(step.name);
      return result?.success === true;
    });
  }

  /**
   * Reset per-step timeout
   */
  private resetStepTimeout(step: WorkflowStep): void {
    if (this.stepTimeoutId) {
      clearTimeout(this.stepTimeoutId);
    }

    const stepTimeout = 60 * 60 * 1000; // 60 minutes per step
    this.stepTimeoutId = setTimeout(() => {
      console.warn(`[StreamingWorkflow] Step "${step.name}" timed out`);
      this.currentStepTimedOut = true;
      this.failCurrentStep(step, "Step timed out");
    }, stepTimeout);
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.workflowTimeoutId) {
      clearTimeout(this.workflowTimeoutId);
      this.workflowTimeoutId = null;
    }
    if (this.stepTimeoutId) {
      clearTimeout(this.stepTimeoutId);
      this.stepTimeoutId = null;
    }
  }

  /**
   * Abort the workflow execution
   */
  abort(): void {
    this.clearTimeouts();
    this.abortController?.abort();
  }

  /**
   * Check if currently running
   */
  isRunning(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }
}
