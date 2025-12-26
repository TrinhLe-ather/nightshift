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
} from "./execution-mode";

// Worktree management
export { type WorktreeInfo, type CreateWorktreeOptions, WorktreeManager } from "./worktree";

// Direct mode management
export { type DirectModeSetup, DirectModeManager } from "./direct-mode";
