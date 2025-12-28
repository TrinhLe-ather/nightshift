/**
 * Executor Module
 *
 * Task execution infrastructure for Night Shift daemon.
 */

export { TaskExecutor, createExecutor, type ExecutorConfig } from "./task-executor";
export {
  SessionManager,
  getSessionManager,
  setSessionManager,
  type Session,
  type SessionEvent,
} from "./session-manager";
export { PreflightChecker, type PreflightResult } from "./preflight-checker";
export { GitOperations, type CommitResult, type PrResult } from "./git-operations";
export { TranscriptWriter, type TranscriptEntry } from "./transcript-writer";

// SDK message types (used for transcript + terminal streaming)
export type { SdkMessage } from "./sdk";

// Streaming workflow execution (single session with context preservation)
export {
  StreamingWorkflowRunner,
  type StreamingWorkflowOptions,
  type StreamingWorkflowResult,
  type WorkflowStepResult,
} from "./streaming-workflow-runner";

// New modules for worktree and pause/resume support
export {
  setupTaskExecution,
  teardownTaskExecution,
  resumeTaskExecution,
  type TaskSetupResult,
  type TaskSetupOptions,
  type TaskSetupError,
} from "./task-setup";
export { pauseTask, resumeTask, buildResumePrompt } from "./task-lifecycle";
