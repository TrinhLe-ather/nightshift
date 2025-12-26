/**
 * Execution Mode Detection
 *
 * Determines whether a repository should use worktree or direct execution mode.
 * Worktree mode enables parallel execution but requires disk space for copies.
 * Direct mode uses the original repo (one task at a time) for large repos.
 */

import { hasHeavyLfsConfig, isShallowClone, isUnrealProject } from "./git";

/**
 * Resolved execution mode for a task
 */
export type ExecutionMode = "worktree" | "direct";

/**
 * User-configurable execution mode setting
 */
export type ExecutionModeConfig = "auto" | "worktree" | "direct";

/**
 * Result of execution mode detection
 */
export interface ExecutionModeResult {
  /** The resolved execution mode */
  mode: ExecutionMode;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether this was auto-detected or user-configured */
  source: "auto" | "config";
}

/**
 * Reasons for choosing direct mode
 */
const DirectModeReasons = {
  UNREAL_PROJECT: "Unreal Engine project detected - worktrees would duplicate large assets",
  HEAVY_LFS: "Heavy Git LFS usage detected - worktrees would require re-downloading assets",
  SHALLOW_CLONE: "Shallow clone detected - worktrees may not work correctly",
  USER_CONFIG: "Direct mode configured by user",
} as const;

/**
 * Reasons for choosing worktree mode
 */
const WorktreeModeReasons = {
  DEFAULT: "Standard repository - using worktrees for parallel execution",
  USER_CONFIG: "Worktree mode configured by user",
} as const;

/**
 * Detect the appropriate execution mode for a repository
 *
 * @param repoPath - Path to the repository
 * @param configuredMode - User's configured mode preference
 * @returns The resolved execution mode and reason
 */
export async function detectExecutionMode(
  repoPath: string,
  configuredMode: ExecutionModeConfig = "auto",
): Promise<ExecutionModeResult> {
  // If user explicitly configured a mode, use it
  if (configuredMode === "worktree") {
    return {
      mode: "worktree",
      reason: WorktreeModeReasons.USER_CONFIG,
      source: "config",
    };
  }

  if (configuredMode === "direct") {
    return {
      mode: "direct",
      reason: DirectModeReasons.USER_CONFIG,
      source: "config",
    };
  }

  // Auto-detect based on repository characteristics
  return autoDetectMode(repoPath);
}

/**
 * Auto-detect execution mode based on repository characteristics
 */
async function autoDetectMode(repoPath: string): Promise<ExecutionModeResult> {
  // Check 1: Unreal Engine project
  if (isUnrealProject(repoPath)) {
    console.log(`[ExecutionMode] Detected Unreal project at ${repoPath}`);
    return {
      mode: "direct",
      reason: DirectModeReasons.UNREAL_PROJECT,
      source: "auto",
    };
  }

  // Check 2: Heavy LFS configuration
  if (await hasHeavyLfsConfig(repoPath)) {
    console.log(`[ExecutionMode] Detected heavy LFS config at ${repoPath}`);
    return {
      mode: "direct",
      reason: DirectModeReasons.HEAVY_LFS,
      source: "auto",
    };
  }

  // Check 3: Shallow clone
  if (await isShallowClone(repoPath)) {
    console.log(`[ExecutionMode] Detected shallow clone at ${repoPath}`);
    return {
      mode: "direct",
      reason: DirectModeReasons.SHALLOW_CLONE,
      source: "auto",
    };
  }

  // Default: use worktrees
  return {
    mode: "worktree",
    reason: WorktreeModeReasons.DEFAULT,
    source: "auto",
  };
}
