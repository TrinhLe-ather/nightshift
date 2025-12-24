/**
 * Repository Module
 *
 * Exports all repository-related functionality including:
 * - Git operations
 * - Execution mode detection
 * - Worktree management
 * - Direct mode management
 */

// Git operations
export * from "./git";

// Execution mode
export {
  type ExecutionMode,
  type ExecutionModeConfig,
  type ExecutionModeResult,
  detectExecutionMode,
  getExecutionModeDescription,
  supportsParallelExecution,
  DirectModeReasons,
  WorktreeModeReasons,
} from "./execution-mode";

// Worktree management
export {
  type WorktreeInfo,
  type CreateWorktreeOptions,
  WorktreeManager,
  worktreeManager,
} from "./worktree";

// Direct mode management
export {
  type DirectModeSetup,
  type DirectModeResult,
  DirectModeError,
  DirectModeManager,
  directModeManager,
} from "./direct-mode";
