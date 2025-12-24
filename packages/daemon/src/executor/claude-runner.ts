/**
 * Claude Runner
 *
 * Executes tasks using Claude Code SDK.
 * Handles agent lifecycle, tool calls, and result capture.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { SessionManager } from "./session-manager";
import { EventLevel, EventType } from "@nightshift/shared";

export interface ClaudeRunnerOptions {
  prompt: string;
  /** Working directory for Claude (worktree path or repo path) */
  workDir: string;
  timeout: number; // in milliseconds
  onNeedsHuman?: (question: string) => void;
}

export interface ClaudeRunResult {
  success: boolean;
  output?: string;
  error?: string;
  needsHuman?: {
    code: string;
    question: string;
  };
}

export class ClaudeRunner {
  private process: ChildProcess | null = null;
  private aborted = false;

  constructor(private sessionManager: SessionManager) {}

  /**
   * Run a task with Claude Code
   */
  async run(options: ClaudeRunnerOptions): Promise<ClaudeRunResult> {
    const { prompt, workDir, timeout, onNeedsHuman } = options;

    this.sessionManager.emit(EventType.AGENT_STARTED, EventLevel.INFO, {
      prompt: prompt.substring(0, 200),
      workDir,
    });

    return new Promise((resolve) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.abort();
        resolve({
          success: false,
          error: "Task execution timed out",
        });
      }, timeout);

      // Spawn claude CLI process
      // Using claude CLI in non-interactive mode with --print flag
      this.process = spawn("claude", ["--print", "-p", prompt], {
        cwd: workDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Ensure non-interactive mode
          CI: "true",
        },
      });

      let stdout = "";
      let stderr = "";

      this.process.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Parse output for events
        this.parseOutput(chunk);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      this.process.on("close", (code) => {
        clearTimeout(timeoutId);

        if (this.aborted) {
          resolve({
            success: false,
            error: "Task was aborted",
          });
          return;
        }

        // Check for needs_human signal in output
        const needsHumanMatch = stdout.match(/\[NEEDS_HUMAN\]\s*(.+)/);
        if (needsHumanMatch) {
          const question = needsHumanMatch[1];

          this.sessionManager.emit(EventType.AGENT_NEEDS_HUMAN, EventLevel.WARN, {
            question,
          });

          onNeedsHuman?.(question);

          resolve({
            success: false,
            needsHuman: {
              code: "NEEDS_HUMAN_CLARIFICATION",
              question,
            },
          });
          return;
        }

        if (code === 0) {
          this.sessionManager.emit(EventType.TASK_COMPLETED, EventLevel.INFO, {
            outputLength: stdout.length,
          });

          resolve({
            success: true,
            output: stdout,
          });
        } else {
          const errorMessage = stderr || `Process exited with code ${code}`;

          this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
            code,
            error: errorMessage.substring(0, 500),
          });

          resolve({
            success: false,
            error: errorMessage,
          });
        }
      });

      this.process.on("error", (error) => {
        clearTimeout(timeoutId);

        this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
          error: error.message,
        });

        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Parse Claude output for tool calls and messages
   */
  private parseOutput(chunk: string): void {
    // Look for tool call patterns
    const toolCallMatch = chunk.match(/\[TOOL_CALL\]\s*(\w+)\s*(.+)?/);
    if (toolCallMatch) {
      this.sessionManager.emit(EventType.AGENT_TOOL_CALL, EventLevel.DEBUG, {
        tool: toolCallMatch[1],
        args: toolCallMatch[2],
      });
    }

    // Look for tool result patterns
    const toolResultMatch = chunk.match(/\[TOOL_RESULT\]\s*(.+)?/);
    if (toolResultMatch) {
      this.sessionManager.emit(EventType.AGENT_TOOL_RESULT, EventLevel.DEBUG, {
        result: toolResultMatch[1]?.substring(0, 200),
      });
    }

    // Look for file modifications
    const fileMatch = chunk.match(/(?:Created|Modified|Deleted):\s*(.+)/);
    if (fileMatch) {
      this.sessionManager.emit(EventType.ARTIFACT_FILE_MODIFIED, EventLevel.INFO, {
        file: fileMatch[1],
      });
    }
  }

  /**
   * Abort the current execution
   */
  abort(): void {
    this.aborted = true;
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
  }
}
