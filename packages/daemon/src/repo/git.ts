/**
 * Git Operations
 *
 * Low-level git command wrappers for repository operations.
 * Used by WorktreeManager, DirectModeManager, and GitOperations.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";

/**
 * Diff statistics from comparing changes
 */
export interface DiffStats {
  /** Full unified diff content */
  content: string;
  /** Number of lines added */
  added: number;
  /** Number of lines removed */
  removed: number;
  /** List of changed files */
  files: string[];
  /** Error during computation (if any) */
  error?: string;
}

/**
 * Execute a git command in a directory
 */
export async function gitExec(
  args: string[],
  cwd: string,
  options: { ignoreError?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await execa("git", args, { cwd });
    return stdout.trimEnd();
  } catch (error) {
    if (options.ignoreError) {
      return "";
    }
    const message = error instanceof Error ? error.message : "Git command failed";
    throw new Error(`git ${args[0] ?? "<unknown>"} failed: ${message}`);
  }
}

/**
 * Get the HEAD commit SHA
 */
export async function getHeadSha(repoPath: string): Promise<string> {
  return gitExec(["rev-parse", "HEAD"], repoPath);
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  return gitExec(["branch", "--show-current"], repoPath);
}

/**
 * Check if a branch exists (local or remote)
 */
export async function branchExists(branch: string, repoPath: string): Promise<boolean> {
  try {
    await gitExec(["rev-parse", "--verify", branch], repoPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the working directory has uncommitted changes
 */
export async function isRepoDirty(repoPath: string): Promise<boolean> {
  const status = await gitExec(["status", "--porcelain"], repoPath);
  return status.length > 0;
}

/**
 * Check if this is a shallow clone
 */
export async function isShallowClone(repoPath: string): Promise<boolean> {
  const result = await gitExec(["rev-parse", "--is-shallow-repository"], repoPath);
  return result === "true";
}

/**
 * Checkout a branch
 */
export async function checkout(branch: string, repoPath: string): Promise<void> {
  await gitExec(["checkout", branch], repoPath);
}

/**
 * Create and checkout a new branch
 */
export async function checkoutNewBranch(branchName: string, repoPath: string): Promise<void> {
  await gitExec(["checkout", "-b", branchName], repoPath);
}

/**
 * Stage all changes and commit
 */
export async function commitAll(message: string, repoPath: string): Promise<string> {
  await gitExec(["add", "-A"], repoPath);
  await gitExec(["commit", "-m", message], repoPath);
  return getHeadSha(repoPath);
}

/**
 * Delete a branch (force)
 */
export async function deleteBranch(branchName: string, repoPath: string): Promise<void> {
  await gitExec(["branch", "-D", branchName], repoPath);
}

// =============================================================================
// Worktree Operations
// =============================================================================

/**
 * Create a new worktree with a new branch
 *
 * @param worktreePath - Path where the worktree will be created
 * @param branchName - Name for the new branch
 * @param baseSha - Commit SHA to base the branch on
 * @param repoPath - Path to the main repository
 */
export async function worktreeAdd(
  worktreePath: string,
  branchName: string,
  baseSha: string,
  repoPath: string,
): Promise<void> {
  await gitExec(["worktree", "add", "-b", branchName, worktreePath, baseSha], repoPath);
}

/**
 * Add a worktree for an existing branch
 *
 * @param worktreePath - Path where the worktree will be created
 * @param branchName - Name of the existing branch
 * @param repoPath - Path to the main repository
 */
export async function worktreeAddExisting(
  worktreePath: string,
  branchName: string,
  repoPath: string,
): Promise<void> {
  await gitExec(["worktree", "add", worktreePath, branchName], repoPath);
}

/**
 * Remove a worktree (force)
 *
 * @param worktreePath - Path to the worktree to remove
 * @param repoPath - Path to the main repository
 */
export async function worktreeRemove(worktreePath: string, repoPath: string): Promise<void> {
  await gitExec(["worktree", "remove", "-f", worktreePath], repoPath);
}

/**
 * Prune stale worktree references
 */
export async function worktreePrune(repoPath: string): Promise<void> {
  await gitExec(["worktree", "prune"], repoPath);
}

/**
 * List all worktrees
 */
export async function worktreeList(
  repoPath: string,
): Promise<Array<{ path: string; branch: string; head: string }>> {
  const output = await gitExec(["worktree", "list", "--porcelain"], repoPath);
  const worktrees: Array<{ path: string; branch: string; head: string }> = [];

  const lines = output.split("\n");
  let current: { path: string; branch: string; head: string } | null = null;

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.substring(9), branch: "", head: "" };
    } else if (line.startsWith("HEAD ") && current) {
      current.head = line.substring(5);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.substring(7).replace("refs/heads/", "");
    }
  }
  if (current) worktrees.push(current);

  return worktrees;
}

// =============================================================================
// Diff Operations
// =============================================================================

/**
 * Get diff statistics from a base commit
 *
 * @param workDir - Working directory (worktree or repo)
 * @param baseSha - Base commit to diff against
 */
export async function getDiffFromBase(workDir: string, baseSha: string): Promise<DiffStats> {
  try {
    // Stage untracked files so they appear in diff
    await gitExec(["add", "-N", "."], workDir, { ignoreError: true });

    // Get the diff content
    const content = await gitExec(["diff", baseSha], workDir);

    // Get list of changed files
    const filesOutput = await gitExec(["diff", "--name-only", baseSha], workDir);
    const files = filesOutput.split("\n").filter(Boolean);

    // Count added/removed lines (excluding diff headers)
    let added = 0;
    let removed = 0;
    for (const line of content.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        added++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removed++;
      }
    }

    return { content, added, removed, files };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diff failed";
    return { content: "", added: 0, removed: 0, files: [], error: message };
  }
}

// =============================================================================
// Repository Detection
// =============================================================================

/**
 * Check if a repository uses Git LFS with large file patterns
 */
export async function hasHeavyLfsConfig(repoPath: string): Promise<boolean> {
  // Check for .lfsconfig or LFS patterns in .gitattributes
  const gitattributesPath = join(repoPath, ".gitattributes");

  if (!existsSync(gitattributesPath)) {
    return false;
  }

  try {
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(gitattributesPath, "utf-8");

    // Look for LFS patterns that suggest large binary files
    const heavyPatterns = [
      /\*.uasset\s+filter=lfs/i,
      /\*.umap\s+filter=lfs/i,
      /\*.pak\s+filter=lfs/i,
      /\*.bin\s+filter=lfs/i,
      /\*.psd\s+filter=lfs/i,
      /\*\.(png|jpg|jpeg|tga|exr)\s+filter=lfs/i,
    ];

    return heavyPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

/**
 * Check if this is an Unreal Engine project
 */
export function isUnrealProject(repoPath: string): boolean {
  // Look for .uproject file in repo root
  const { readdirSync } = require("node:fs");
  try {
    const files = readdirSync(repoPath);
    return files.some((f: string) => f.endsWith(".uproject"));
  } catch {
    return false;
  }
}
