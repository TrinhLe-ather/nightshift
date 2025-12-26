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
export { ClaudeRunner, type ClaudeRunnerOptions, type ClaudeRunResult } from "./claude-runner";
export { RepoLock, type LockInfo } from "./repo-lock";
export { TranscriptWriter, type TranscriptEntry } from "./transcript-writer";

// SDK-based execution (Claude Agent SDK v2)
export { SdkRunner, type SdkRunnerOptions, type SdkRunResult, type SdkMessage } from "./sdk";

// Interactive chat executor (dual-mode architecture)
export { InteractiveExecutor } from "./interactive-executor";

// New modules for worktree and pause/resume support
export {
  setupTaskExecution,
  teardownTaskExecution,
  resumeTaskExecution,
  type TaskSetupResult,
  type TaskSetupOptions,
  type TaskSetupError,
} from "./task-setup";
export {
  pauseTask,
  resumeTask,
  cancelTask,
  buildResumePrompt,
  getTasksNeedingInput,
  type LifecycleResult,
} from "./task-lifecycle";
