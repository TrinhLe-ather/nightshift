/**
 * Repo Repository
 *
 * Handles all database operations for repositories using Drizzle ORM.
 */

import { eq } from "drizzle-orm";
import { getDb, repos } from "../db/drizzle";
import type { CreateRepo, Repo } from "@nightshift/shared";
import { existsSync } from "fs";
import { execSync } from "child_process";

/**
 * Generate a unique repo ID
 */
function generateRepoId(): string {
  return `repo_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

/**
 * Check if path is a valid git repository
 */
export function isGitRepository(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    execSync("git rev-parse --git-dir", {
      cwd: path,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repo name from git remote or directory name
 */
export function getRepoName(path: string): string {
  try {
    // Try to get name from git remote
    const remote = execSync("git remote get-url origin", {
      cwd: path,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    // Extract repo name from URL
    // e.g., git@github.com:user/repo.git -> repo
    // or https://github.com/user/repo -> repo
    const match = remote.match(/\/([^/]+?)(\.git)?$/);
    if (match) {
      return match[1]!;
    }
  } catch {
    // Ignore errors, fall back to directory name
  }

  // Fall back to directory name
  const parts = path.split("/");
  return parts[parts.length - 1] || "unknown";
}

/**
 * Get default branch name
 */
export function getDefaultBranch(path: string): string {
  try {
    const branch = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: path,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    // Extract branch name from refs/remotes/origin/HEAD -> refs/remotes/origin/main
    const match = branch.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) {
      return match[1]!;
    }
  } catch {
    // Ignore errors, fall back to 'main'
  }

  return "main";
}

/**
 * Get repo by ID
 */
export function getRepoById(repoId: string): Repo | null {
  const db = getDb();

  const result = db.select().from(repos).where(eq(repos.id, repoId)).get();

  return result ? mapDbRepoToRepo(result) : null;
}

/**
 * Get repo by path
 */
export function getRepoByPath(path: string): Repo | null {
  const db = getDb();

  const result = db.select().from(repos).where(eq(repos.path, path)).get();

  return result ? mapDbRepoToRepo(result) : null;
}

/**
 * Create a new repo
 */
export function createRepo(input: CreateRepo): Repo {
  const db = getDb();

  // Check if repo already exists
  const existing = getRepoByPath(input.path);
  if (existing) {
    return existing;
  }

  const newRepo = {
    id: generateRepoId(),
    name: getRepoName(input.path),
    path: input.path,
    defaultBranch: getDefaultBranch(input.path),
    executionMode: "auto" as const,
    createdAt: new Date().toISOString(),
  };

  db.insert(repos).values(newRepo).run();

  return mapDbRepoToRepo(newRepo as typeof repos.$inferSelect);
}

/**
 * Get all repos
 */
export function getAllRepos(): Repo[] {
  const db = getDb();

  const results = db.select().from(repos).orderBy(repos.name).all();

  return results.map(mapDbRepoToRepo);
}

/**
 * Delete repo by ID
 */
export function deleteRepo(repoId: string): boolean {
  const db = getDb();

  // Check if repo exists before deleting
  const existing = db.select({ id: repos.id }).from(repos).where(eq(repos.id, repoId)).get();
  if (!existing) return false;

  db.delete(repos).where(eq(repos.id, repoId)).run();
  return true;
}

/**
 * Update repo
 */
export function updateRepo(
  repoId: string,
  updates: Partial<Pick<Repo, "name" | "defaultBranch" | "executionMode">>,
): Repo | null {
  const db = getDb();

  const setValues: Partial<typeof repos.$inferInsert> = {};

  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.defaultBranch !== undefined) setValues.defaultBranch = updates.defaultBranch;
  if (updates.executionMode !== undefined) setValues.executionMode = updates.executionMode;

  if (Object.keys(setValues).length === 0) {
    return getRepoById(repoId);
  }

  db.update(repos).set(setValues).where(eq(repos.id, repoId)).run();

  return getRepoById(repoId);
}

/**
 * Get repo count
 */
export function getRepoCount(): number {
  const db = getDb();

  const result = db.select({ count: repos.id }).from(repos).all();

  return result.length;
}

/**
 * Map database repo to shared Repo type
 */
function mapDbRepoToRepo(row: typeof repos.$inferSelect): Repo {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    defaultBranch: row.defaultBranch ?? "main",
    executionMode: (row.executionMode as "auto" | "worktree" | "direct") ?? "auto",
    createdAt: row.createdAt,
  };
}
