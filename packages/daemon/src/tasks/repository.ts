/**
 * Task Repository
 *
 * Handles all database operations for tasks using Drizzle ORM.
 */

import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { type NewTask, type Task, type TaskStatus, getDb, repos, tasks } from "../db/drizzle";
import type { CreateTask, Priority, UpdateTask } from "@nightshift/shared";
import { TaskState as TaskStateEnum } from "@nightshift/shared";
import { ensureInitialPromptInTranscript } from "./transcript";

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

/**
 * Create a new task
 */
export function createTask(input: CreateTask): Task {
  const db = getDb();

  const now = new Date().toISOString();
  const id = generateTaskId();

  // Get repo path if repoId is provided
  let derivedRepoPath: string | null = null;
  if (input.repoId) {
    const repo = db
      .select({ path: repos.path })
      .from(repos)
      .where(eq(repos.id, input.repoId))
      .get();

    if (!repo) {
      throw new Error(`Repo not found: ${input.repoId}`);
    }
    derivedRepoPath = repo.path;
  }

  // Validate repoId vs repoPath consistency if both are provided
  // Note: repoPath is derived from repoId when only repoId is provided
  if (input.repoId && input.repoPath && derivedRepoPath !== input.repoPath) {
    throw new Error(
      `Repo path mismatch: the provided repoPath "${input.repoPath}" does not match the path "${derivedRepoPath}" of the repository identified by repoId "${input.repoId}"`,
    );
  }

  const newTask: NewTask = {
    id,
    prompt: input.prompt,
    repoId: input.repoId ?? null,
    repoPath: derivedRepoPath ?? input.repoPath ?? null,
    priority: input.priority ?? "medium",
    status: TaskStateEnum.PENDING,
    githubIssueUrl: input.githubIssueUrl ?? null,
    branch: input.branch ?? null,
    createdAt: now,
    autoYes: input.autoYes ?? false,
    // Workflow-only: ensure every task has a workflowId.
    workflowId: input.workflowId ?? "quick-task",
    model: input.model ?? null,
  };

  db.insert(tasks).values(newTask).run();

  // Ensure prompt is visible immediately in the transcript (even before execution starts).
  // Use the same data dir override the rest of the daemon uses.
  ensureInitialPromptInTranscript({
    taskId: id,
    prompt: input.prompt,
    createdAt: now,
    dataDirOverride: process.env.NIGHTSHIFT_DATA_DIR,
  });

  // Fetch the created task to get the full object with defaults
  return db.select().from(tasks).where(eq(tasks.id, id)).get()!;
}

/**
 * Get task by ID
 */
export function getTaskById(taskId: string): Task | null {
  const db = getDb();
  return db.select().from(tasks).where(eq(tasks.id, taskId)).get() ?? null;
}

/**
 * Get all tasks with optional filtering
 */
export interface GetTasksOptions {
  status?: TaskStatus | TaskStatus[];
  repoId?: string;
  priority?: Priority | Priority[];
  limit?: number;
  offset?: number;
}

export function getTasks(options: GetTasksOptions = {}): Task[] {
  const db = getDb();

  // Build conditions array
  const conditions: SQL[] = [];

  if (options.status) {
    if (Array.isArray(options.status)) {
      conditions.push(inArray(tasks.status, options.status));
    } else {
      conditions.push(eq(tasks.status, options.status));
    }
  }

  if (options.repoId) {
    conditions.push(eq(tasks.repoId, options.repoId));
  }

  if (options.priority) {
    if (Array.isArray(options.priority)) {
      conditions.push(inArray(tasks.priority, options.priority));
    } else {
      conditions.push(eq(tasks.priority, options.priority));
    }
  }

  // Build query
  let query = db.select().from(tasks);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  query = query.orderBy(desc(tasks.createdAt)) as typeof query;

  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  if (options.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return query.all();
}

/**
 * Update task
 */
export function updateTask(taskId: string, updates: UpdateTask): Task | null {
  const db = getDb();

  // Build the set object dynamically
  const setValues: Partial<typeof tasks.$inferInsert> = {};

  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.priority !== undefined) setValues.priority = updates.priority;
  if (updates.failureCode !== undefined) setValues.failureCode = updates.failureCode;
  if (updates.prUrl !== undefined) setValues.prUrl = updates.prUrl;
  if (updates.claimedAt !== undefined) setValues.claimedAt = updates.claimedAt;
  if (updates.startedAt !== undefined) setValues.startedAt = updates.startedAt;
  if (updates.completedAt !== undefined) setValues.completedAt = updates.completedAt;

  // Worktree & execution mode fields
  if (updates.executionMode !== undefined) setValues.executionMode = updates.executionMode;
  if (updates.workDir !== undefined) setValues.workDir = updates.workDir;
  if (updates.baseCommitSha !== undefined) setValues.baseCommitSha = updates.baseCommitSha;
  if (updates.originalBranch !== undefined) setValues.originalBranch = updates.originalBranch;
  if (updates.branch !== undefined) setValues.branch = updates.branch;

  // Pause/resume fields
  if (updates.pausedAt !== undefined) setValues.pausedAt = updates.pausedAt;
  if (updates.pauseReason !== undefined) setValues.pauseReason = updates.pauseReason;
  if (updates.humanQuestion !== undefined) setValues.humanQuestion = updates.humanQuestion;
  if (updates.humanResponse !== undefined) setValues.humanResponse = updates.humanResponse;

  // Workflow fields
  if (updates.currentStep !== undefined) setValues.currentStep = updates.currentStep;
  if (updates.totalSteps !== undefined) setValues.totalSteps = updates.totalSteps;

  // Model selection
  if (updates.model !== undefined) setValues.model = updates.model;

  // Session resume fields (continue task feature)
  if (updates.sdkSessionId !== undefined) setValues.sdkSessionId = updates.sdkSessionId;
  if (updates.continuePrompt !== undefined) setValues.continuePrompt = updates.continuePrompt;

  if (Object.keys(setValues).length === 0) {
    // No updates provided
    return getTaskById(taskId);
  }

  db.update(tasks).set(setValues).where(eq(tasks.id, taskId)).run();

  return getTaskById(taskId);
}

/**
 * Delete task
 */
export function deleteTask(taskId: string): boolean {
  const db = getDb();

  // Check if task exists before deleting
  const existing = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).get();
  if (!existing) return false;

  db.delete(tasks).where(eq(tasks.id, taskId)).run();
  return true;
}

/**
 * Get count of tasks by status
 */
export function getTaskCountByStatus(): Record<string, number> {
  const db = getDb();

  const results = db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .groupBy(tasks.status)
    .all();

  const counts: Record<string, number> = {};
  for (const row of results) {
    if (row.status) {
      counts[row.status] = row.count;
    }
  }

  return counts;
}

/**
 * Get total task count
 */
export function getTaskCount(): number {
  const db = getDb();

  const result = db.select({ count: count() }).from(tasks).get();

  return result?.count ?? 0;
}

/**
 * Get next pending task (for executor)
 */
export function getNextPendingTask(): Task | null {
  const db = getDb();

  // Priority order: urgent > high > medium > low
  const priorityOrder = sql`CASE
    WHEN ${tasks.priority} = 'urgent' THEN 1
    WHEN ${tasks.priority} = 'high' THEN 2
    WHEN ${tasks.priority} = 'medium' THEN 3
    WHEN ${tasks.priority} = 'low' THEN 4
    ELSE 5
  END`;

  return (
    db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "pending"))
      .orderBy(priorityOrder, tasks.createdAt)
      .limit(1)
      .get() ?? null
  );
}

/**
 * Atomically claim the next pending task
 *
 * RACE CONDITION FIX:
 * This function atomically selects and updates a pending task in a single SQL operation.
 * Previously, getNextPendingTask() followed by updateTask() created a race window where
 * multiple executors could claim the same task.
 *
 * Uses SQLite's UPDATE...RETURNING to atomically:
 * 1. Find the highest priority pending task
 * 2. Set its status to 'claimed' and record claimedAt timestamp
 * 3. Return the claimed task (or null if no pending tasks)
 *
 * @returns The claimed task, or null if no pending tasks available
 */
export function claimNextPendingTask(): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  // Priority order for subquery: urgent > high > medium > low
  const priorityOrder = sql`CASE
    WHEN ${tasks.priority} = 'urgent' THEN 1
    WHEN ${tasks.priority} = 'high' THEN 2
    WHEN ${tasks.priority} = 'medium' THEN 3
    WHEN ${tasks.priority} = 'low' THEN 4
    ELSE 5
  END`;

  // Atomic claim using UPDATE...WHERE id=(SELECT...) RETURNING *
  // This is a single SQL statement that atomically:
  // 1. Finds the highest priority pending task
  // 2. Updates it to claimed status
  // 3. Returns the updated row
  return (
    db
      .update(tasks)
      .set({
        status: "claimed",
        claimedAt: now,
      })
      .where(
        eq(
          tasks.id,
          // Subquery to select the highest priority pending task
          sql`(SELECT ${tasks.id} FROM ${tasks} WHERE ${tasks.status} = 'pending' ORDER BY ${priorityOrder}, ${tasks.createdAt} LIMIT 1)`,
        ),
      )
      .returning()
      .get() ?? null
  );
}
