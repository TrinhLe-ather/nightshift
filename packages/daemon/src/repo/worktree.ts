/**
 * Worktree Manager
 *
 * Manages git worktrees for isolated task execution.
 * Each task gets its own worktree with a dedicated branch,
 * enabling parallel execution on the same repository.
 */

import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { WORKTREES_DIR } from "../config/paths";
import {
  type DiffStats,
  branchExists,
  commitAll,
  getDiffFromBase,
  getHeadSha,
  worktreeAdd,
  worktreeAddExisting,
  worktreeList,
  worktreePrune,
  worktreeRemove,
} from "./git";

/**
 * Information about a created worktree
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Name of the branch created for this worktree */
  branch: string;
  /** SHA of the commit this worktree was based on */
  baseCommitSha: string;
  /** Path to the original repository */
  repoPath: string;
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  /** Task ID (used for naming) */
  taskId: string;
  /** Path to the source repository */
  repoPath: string;
  /** Optional: specific commit to base the worktree on (defaults to HEAD) */
  baseSha?: string;
}

/**
 * Manages git worktrees for task execution
 */
export class WorktreeManager {
  private baseDir: string;

  constructor(baseDir: string = WORKTREES_DIR) {
    this.baseDir = baseDir;
  }

  /**
   * Generate the worktree path for a task
   */
  getWorktreePath(taskId: string): string {
    return join(this.baseDir, taskId);
  }

  /**
   * Generate the branch name for a task
   */
  getBranchName(taskId: string): string {
    return `nightshift/${taskId}`;
  }

  /**
   * Create a new worktree for a task
   *
   * If a branch already exists (from a previous paused task), it will be reused.
   * Otherwise, a new branch is created from HEAD (or specified base).
   */
  async create(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
    const { taskId, repoPath, baseSha } = options;

    const worktreePath = this.getWorktreePath(taskId);
    const branchName = this.getBranchName(taskId);

    // Get the base commit
    const baseCommitSha = baseSha ?? (await getHeadSha(repoPath));

    // Check if branch already exists (resume scenario)
    const branchAlreadyExists = await branchExists(branchName, repoPath);

    try {
      if (branchAlreadyExists) {
        // Resume: use existing branch
        console.log(`[WorktreeManager] Resuming existing branch ${branchName}`);
        await worktreeAddExisting(worktreePath, branchName, repoPath);
      } else {
        // New: create fresh branch from base commit
        console.log(
          `[WorktreeManager] Creating new worktree at ${worktreePath} from ${baseCommitSha.substring(0, 8)}`,
        );
        await worktreeAdd(worktreePath, branchName, baseCommitSha, repoPath);
      }

      return {
        path: worktreePath,
        branch: branchName,
        baseCommitSha,
        repoPath,
      };
    } catch (error) {
      // Clean up on failure
      await this.cleanup(worktreePath, repoPath);
      throw error;
    }
  }

  /**
   * Remove a worktree (keeps the branch for potential resume)
   *
   * @param worktreePath - Path to the worktree
   * @param repoPath - Path to the main repository
   * @param commitMessage - Optional: commit changes before removing
   */
  async remove(worktreePath: string, repoPath: string, commitMessage?: string): Promise<void> {
    if (!existsSync(worktreePath)) {
      console.log(`[WorktreeManager] Worktree already removed: ${worktreePath}`);
      return;
    }

    // Optionally commit changes before removing
    if (commitMessage) {
      try {
        await commitAll(commitMessage, worktreePath);
        console.log(`[WorktreeManager] Committed changes: ${commitMessage}`);
      } catch {
        // No changes to commit, continue
      }
    }

    // Remove the worktree
    try {
      await worktreeRemove(worktreePath, repoPath);
      console.log(`[WorktreeManager] Removed worktree: ${worktreePath}`);
    } catch {
      // Force remove if git command fails
      console.log(`[WorktreeManager] Force removing directory: ${worktreePath}`);
      rmSync(worktreePath, { recursive: true, force: true });
    }

    // Prune stale references
    await this.prune(repoPath);
  }

  /**
   * Check if a worktree exists
   */
  async exists(worktreePath: string): Promise<boolean> {
    return existsSync(worktreePath);
  }

  /**
   * Get diff statistics for a worktree
   */
  async getDiff(worktreePath: string, baseSha: string): Promise<DiffStats> {
    return getDiffFromBase(worktreePath, baseSha);
  }

  /**
   * Prune stale worktree references
   */
  async prune(repoPath: string): Promise<void> {
    try {
      await worktreePrune(repoPath);
    } catch {
      // Ignore prune errors
    }
  }

  /**
   * List all worktrees for a repository
   */
  async list(repoPath: string): Promise<Array<{ path: string; branch: string; head: string }>> {
    return worktreeList(repoPath);
  }

  /**
   * Clean up worktree and any stale state
   */
  private async cleanup(worktreePath: string, repoPath: string): Promise<void> {
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
    await this.prune(repoPath);
  }

  /**
   * Clean up all worktrees for tasks that no longer exist
   *
   * @param activeTaskIds - Set of task IDs that are still active
   */
  async cleanupOrphaned(repoPath: string, activeTaskIds: Set<string>): Promise<number> {
    const worktrees = await this.list(repoPath);
    let cleaned = 0;

    for (const wt of worktrees) {
      // Check if this is a nightshift worktree
      if (wt.branch.startsWith("nightshift/")) {
        const taskId = wt.branch.replace("nightshift/", "");

        if (!activeTaskIds.has(taskId)) {
          console.log(`[WorktreeManager] Cleaning orphaned worktree for task ${taskId}`);
          await this.remove(wt.path, repoPath);
          cleaned++;
        }
      }
    }

    return cleaned;
  }
}

// Default singleton instance
export const worktreeManager = new WorktreeManager();
