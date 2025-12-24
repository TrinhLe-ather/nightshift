/**
 * Tasks oRPC Contract
 *
 * Type-safe API definitions for task CRUD operations.
 * Converted from Hono routes to oRPC contracts.
 */

import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type Task, getDb, repos, sessions, tasks } from "../../db/drizzle";
import { TaskState } from "@nightshift/shared";
import { pauseTask, resumeTask } from "../../executor/task-lifecycle";
import { type DiffStats, getDiffFromBase } from "../../repo/git";
import { orpc } from "../base";

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

// Zod schemas for validation
const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const taskStatusSchema = z.enum([
  "pending",
  "claimed",
  "running",
  "paused",
  "completed",
  "failed",
  "needs_human",
  "canceled",
]);
const pauseReasonSchema = z.enum(["manual", "needs_human", "rate_limit"]);

const taskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  repoId: z.string().nullable(),
  repoPath: z.string().nullable(),
  priority: prioritySchema.nullable(),
  status: taskStatusSchema,
  failureCode: z.string().nullable(),
  needsHumanCode: z.string().nullable(),
  needsHumanQuestion: z.string().nullable(),
  clarificationResponse: z.string().nullable(),
  githubIssueUrl: z.string().nullable(),
  branch: z.string().nullable(),
  prUrl: z.string().nullable(),
  createdAt: z.string(),
  claimedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  remoteId: z.string().nullable(),
  source: z.enum(["local", "remote"]).nullable(),
  executionMode: z.enum(["worktree", "direct"]).nullable(),
  workDir: z.string().nullable(),
  baseCommitSha: z.string().nullable(),
  originalBranch: z.string().nullable(),
  pausedAt: z.string().nullable(),
  pauseReason: pauseReasonSchema.nullable(),
  humanQuestion: z.string().nullable(),
  humanResponse: z.string().nullable(),
});

const sessionInfoSchema = z.object({
  id: z.string(),
  eventsPath: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  eventCount: z.number().nullable(),
});

const diffStatsSchema = z.object({
  content: z.string(),
  added: z.number(),
  removed: z.number(),
  files: z.array(z.string()),
  error: z.string().optional(),
});

// List tasks with optional filters
const list = orpc
  .input(
    z.object({
      status: z.string().optional(),
      repoId: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }),
  )
  .output(
    z.object({
      tasks: z.array(taskSchema),
      pagination: z.object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
      }),
    }),
  )
  .handler(async ({ input }) => {
    const db = getDb();
    const { status, repoId, limit, offset } = input;

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) {
      const statuses = status.split(",") as Task["status"][];
      conditions.push(inArray(tasks.status, statuses));
    }

    if (repoId) {
      conditions.push(eq(tasks.repoId, repoId));
    }

    // Get tasks with filters
    const taskList = db
      .select()
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count for pagination
    const countResult = db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .get();

    return {
      tasks: taskList,
      pagination: {
        total: countResult?.total ?? 0,
        limit,
        offset,
      },
    };
  });

// Get single task by ID with session info
const get = orpc
  .input(z.object({ id: z.string() }))
  .output(
    taskSchema.extend({
      session: sessionInfoSchema.nullable(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();

    if (!task) {
      throw errors.NOT_FOUND({
        message: "Task not found",
        data: { resource: "task", id },
      });
    }

    // Get session events if available
    const session = db
      .select({
        id: sessions.id,
        eventsPath: sessions.eventsPath,
        startedAt: sessions.startedAt,
        completedAt: sessions.completedAt,
        eventCount: sessions.eventCount,
      })
      .from(sessions)
      .where(eq(sessions.taskId, id))
      .get();

    return {
      ...task,
      session: session ?? null,
    };
  });

// Create new task
const create = orpc
  .input(
    z.object({
      prompt: z.string().min(1),
      repoId: z.string().optional(),
      priority: prioritySchema.optional(),
      githubIssueUrl: z.string().optional(),
      branch: z.string().optional(),
    }),
  )
  .output(taskSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();

    if (!input.prompt || input.prompt.trim().length === 0) {
      throw errors.BAD_REQUEST({
        message: "Prompt is required",
        data: { field: "prompt" },
      });
    }

    const priority = (input.priority || "medium").toLowerCase() as Task["priority"];
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(priority!)) {
      throw errors.BAD_REQUEST({
        message: "Invalid priority",
        data: { field: "priority" },
      });
    }

    // Get repo path if repoId is provided
    let repoPath: string | null = null;
    if (input.repoId) {
      const repo = db
        .select({ path: repos.path })
        .from(repos)
        .where(eq(repos.id, input.repoId))
        .get();

      if (!repo) {
        throw errors.NOT_FOUND({
          message: "Repo not found",
          data: { resource: "repo", id: input.repoId },
        });
      }
      repoPath = repo.path;
    }

    const id = generateTaskId();
    const now = new Date().toISOString();

    db.insert(tasks)
      .values({
        id,
        prompt: input.prompt.trim(),
        repoId: input.repoId || null,
        repoPath,
        priority,
        status: "pending",
        githubIssueUrl: input.githubIssueUrl || null,
        branch: input.branch || null,
        createdAt: now,
      })
      .run();

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();

    if (!task) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to create task" });
    }

    return task;
  });

// Update task
const update = orpc
  .input(
    z.object({
      id: z.string(),
      status: taskStatusSchema.optional(),
      priority: prioritySchema.optional(),
      clarificationResponse: z.string().optional(),
    }),
  )
  .output(taskSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id, ...updateFields } = input;

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) {
      throw errors.NOT_FOUND({ message: "Task not found", data: { resource: "task", id } });
    }

    const updates: Partial<Task> = {};

    if (updateFields.status) {
      const validStatuses = Object.values(TaskState).map((s) => s.toLowerCase());
      const normalizedStatus = updateFields.status.toLowerCase() as Task["status"];
      if (!validStatuses.includes(normalizedStatus)) {
        throw errors.BAD_REQUEST({ message: "Invalid status", data: { field: "status" } });
      }
      updates.status = normalizedStatus;

      // Set completedAt for terminal states
      if (["completed", "failed", "canceled"].includes(normalizedStatus)) {
        updates.completedAt = new Date().toISOString();
      }
    }

    if (updateFields.priority) {
      const validPriorities = ["low", "medium", "high", "urgent"];
      const normalizedPriority = updateFields.priority.toLowerCase() as Task["priority"];
      if (!validPriorities.includes(normalizedPriority!)) {
        throw errors.BAD_REQUEST({ message: "Invalid priority", data: { field: "priority" } });
      }
      updates.priority = normalizedPriority;
    }

    if (updateFields.clarificationResponse) {
      updates.clarificationResponse = updateFields.clarificationResponse;
    }

    if (Object.keys(updates).length === 0) {
      throw errors.BAD_REQUEST({ message: "No valid updates provided" });
    }

    db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, id)).get();

    if (!updatedTask) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to update task" });
    }

    return updatedTask;
  });

// Cancel task
const cancel = orpc
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), status: z.literal("canceled") }))
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) {
      throw errors.NOT_FOUND({ message: "Task not found", data: { resource: "task", id } });
    }

    // Only allow canceling pending tasks
    if (task.status !== "pending") {
      throw errors.INVALID_STATE({
        message: "Can only cancel pending tasks",
        data: { expected: "pending", actual: task.status },
      });
    }

    const now = new Date().toISOString();
    db.update(tasks)
      .set({
        status: "canceled",
        completedAt: now,
      })
      .where(eq(tasks.id, id))
      .run();

    return { id, status: "canceled" };
  });

// Pause a running task
const pause = orpc
  .input(
    z.object({
      id: z.string(),
      reason: pauseReasonSchema.optional(),
    }),
  )
  .output(taskSchema)
  .handler(async ({ input, errors }) => {
    const { id, reason = "manual" } = input;

    const result = await pauseTask(id, reason);

    if (!result.success) {
      if (result.error?.code === "TASK_NOT_FOUND") {
        throw errors.NOT_FOUND({ message: "Task not found", data: { resource: "task", id } });
      }
      if (result.error?.code === "INVALID_STATE") {
        throw errors.INVALID_STATE({ message: "Cannot pause task in current state" });
      }
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to pause task" });
    }

    // Fetch updated task
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();

    if (!task) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Task not found after pause" });
    }

    return task;
  });

// Resume a paused task
const resume = orpc
  .input(
    z.object({
      id: z.string(),
      response: z.string().optional(),
    }),
  )
  .output(taskSchema)
  .handler(async ({ input, errors }) => {
    const { id, response } = input;

    const result = await resumeTask(id, response);

    if (!result.success) {
      if (result.error?.code === "TASK_NOT_FOUND") {
        throw errors.NOT_FOUND({ message: "Task not found", data: { resource: "task", id } });
      }
      if (result.error?.code === "INVALID_STATE") {
        throw errors.INVALID_STATE({ message: "Cannot resume task in current state" });
      }
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to resume task" });
    }

    // Fetch updated task
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();

    if (!task) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Task not found after resume" });
    }

    return task;
  });

// Get git diff stats from base commit
const getDiff = orpc
  .input(z.object({ id: z.string() }))
  .output(diffStatsSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const task = db
      .select({
        workDir: tasks.workDir,
        baseCommitSha: tasks.baseCommitSha,
        repoPath: tasks.repoPath,
        executionMode: tasks.executionMode,
      })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();

    if (!task) {
      throw errors.NOT_FOUND({ message: "Task not found", data: { resource: "task", id } });
    }

    if (!task.baseCommitSha) {
      return {
        content: "",
        added: 0,
        removed: 0,
        files: [],
      } satisfies DiffStats;
    }

    // Use workDir for worktree mode, repoPath for direct mode
    const diffPath = task.workDir || task.repoPath;
    if (!diffPath) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Task has no working directory" });
    }

    try {
      const diff = await getDiffFromBase(diffPath, task.baseCommitSha);
      return diff;
    } catch (error) {
      // Avoid leaking raw error details to the client.
      console.error("[tasks.getDiff] Failed to get diff:", error);
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to get diff" });
    }
  });

export const tasksRouter = {
  list,
  get,
  create,
  update,
  cancel,
  pause,
  resume,
  getDiff,
};
