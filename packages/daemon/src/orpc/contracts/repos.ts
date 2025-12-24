/**
 * oRPC Contracts for Repos Endpoints
 *
 * Provides type-safe RPC handlers for repository CRUD operations.
 */

import { z } from "zod";
import { existsSync, statSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { getDb, repos, tasks } from "../../db/drizzle";
import { getDefaultBranch, getRepoName, isGitRepository } from "../../tasks/repos";
import { orpc } from "../base";

// =============================================================================
// Zod Schemas
// =============================================================================

const repoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  defaultBranch: z.string().nullable(),
  executionMode: z.enum(["auto", "worktree", "direct"]).nullable(),
  createdAt: z.string(),
});

const taskStatsSchema = z.object({
  pending: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
});

const repoWithStatsSchema = repoSchema.extend({
  exists: z.boolean(),
  taskStats: taskStatsSchema,
});

// =============================================================================
// Helper Functions
// =============================================================================

function generateRepoId(): string {
  return `repo_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * List all repositories
 */
const list = orpc.output(z.array(repoSchema)).handler(async () => {
  const db = getDb();
  const repoList = db
    .select({
      id: repos.id,
      name: repos.name,
      path: repos.path,
      defaultBranch: repos.defaultBranch,
      executionMode: repos.executionMode,
      createdAt: repos.createdAt,
    })
    .from(repos)
    .orderBy(repos.name)
    .all();

  return repoList;
});

/**
 * Get single repository with path validation and task stats
 */
const get = orpc
  .input(z.object({ id: z.string() }))
  .output(repoWithStatsSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const repo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if path still exists
    const exists = existsSync(repo.path);

    // Get task counts for this repo using Drizzle
    const taskStats = db
      .select({
        pending: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' THEN 1 END)`,
        running: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'running' THEN 1 END)`,
        completed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'completed' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'failed' THEN 1 END)`,
      })
      .from(tasks)
      .where(eq(tasks.repoId, id))
      .get() ?? { pending: 0, running: 0, completed: 0, failed: 0 };

    return {
      ...repo,
      exists,
      taskStats,
    };
  });

/**
 * Add new repository
 * Validates path exists, is directory, and is git repo
 */
const add = orpc
  .input(
    z.object({
      path: z.string().min(1),
      name: z.string().optional(),
      defaultBranch: z.string().optional(),
    }),
  )
  .output(repoSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const path = input.path.trim();

    // Validate path exists and is a directory
    if (!existsSync(path)) {
      throw errors.BAD_REQUEST({ message: "Path does not exist", data: { field: "path" } });
    }

    const stat = statSync(path);
    if (!stat.isDirectory()) {
      throw errors.BAD_REQUEST({ message: "Path is not a directory", data: { field: "path" } });
    }

    // Validate it's a git repository
    if (!isGitRepository(path)) {
      throw errors.BAD_REQUEST({
        message: "Path is not a git repository",
        data: { field: "path" },
      });
    }

    // Check if repo already exists
    const existing = db.select({ id: repos.id }).from(repos).where(eq(repos.path, path)).get();

    if (existing) {
      throw errors.CONFLICT({ message: "Repo already exists" });
    }

    // Auto-detect name from git remote and default branch
    const name = input.name?.trim() || getRepoName(path);
    const defaultBranch = input.defaultBranch?.trim() || getDefaultBranch(path);
    const id = generateRepoId();
    const now = new Date().toISOString();

    db.insert(repos)
      .values({
        id,
        name,
        path,
        defaultBranch,
        createdAt: now,
      })
      .run();

    const repo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!repo) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to create repo" });
    }

    return repo;
  });

/**
 * Update repository
 * Allows updating name, defaultBranch, and executionMode
 */
const update = orpc
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      defaultBranch: z.string().optional(),
      executionMode: z.enum(["auto", "worktree", "direct"]).optional(),
    }),
  )
  .output(repoSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id, ...updates } = input;

    const repo = db.select().from(repos).where(eq(repos.id, id)).get();
    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Build update object dynamically
    const updateValues: Record<string, string> = {};

    if (updates.name) {
      updateValues.name = updates.name.trim();
    }

    if (updates.defaultBranch) {
      updateValues.defaultBranch = updates.defaultBranch.trim();
    }

    if (updates.executionMode) {
      updateValues.executionMode = updates.executionMode;
    }

    if (Object.keys(updateValues).length === 0) {
      throw errors.BAD_REQUEST({ message: "No valid updates provided" });
    }

    db.update(repos).set(updateValues).where(eq(repos.id, id)).run();

    const updatedRepo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!updatedRepo) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to update repo" });
    }

    return updatedRepo;
  });

/**
 * Remove repository
 * Blocks if active tasks exist
 */
const remove = orpc
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), deleted: z.boolean() }))
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const repo = db.select().from(repos).where(eq(repos.id, id)).get();
    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if there are active tasks for this repo
    const activeTask = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.repoId} = ${id} AND ${tasks.status} IN ('pending', 'running')`)
      .limit(1)
      .get();

    if (activeTask) {
      throw errors.CONFLICT({ message: "Cannot delete repo with active tasks" });
    }

    db.delete(repos).where(eq(repos.id, id)).run();

    return { id, deleted: true };
  });

// =============================================================================
// Router Export
// =============================================================================

export const reposRouter = {
  list,
  get,
  add,
  update,
  remove,
};
