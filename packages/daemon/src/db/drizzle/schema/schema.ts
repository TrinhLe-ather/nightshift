/**
 * Drizzle ORM Schema
 *
 * Type-safe SQLite schema definitions for NightShift daemon.
 * All field names use camelCase per architecture standards.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Enums (as const for type safety)
// ============================================================================

export const priorityEnum = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof priorityEnum)[number];

export const taskStatusEnum = [
  "pending",
  "claimed",
  "running",
  "paused",
  "completed",
  "failed",
  "needs_human",
  "canceled",
] as const;
export type TaskStatus = (typeof taskStatusEnum)[number];

export const sourceEnum = ["local", "remote"] as const;
export type Source = (typeof sourceEnum)[number];

export const executionModeEnum = ["worktree", "direct"] as const;
export type ExecutionMode = (typeof executionModeEnum)[number];

export const executionModeConfigEnum = ["auto", "worktree", "direct"] as const;
export type ExecutionModeConfig = (typeof executionModeConfigEnum)[number];

export const pauseReasonEnum = ["manual", "needs_human", "rate_limit"] as const;
export type PauseReason = (typeof pauseReasonEnum)[number];

export const entityTypeEnum = ["task", "session", "config"] as const;
export type EntityType = (typeof entityTypeEnum)[number];

export const syncActionEnum = ["create", "update", "delete"] as const;
export type SyncAction = (typeof syncActionEnum)[number];

// ============================================================================
// Tables
// ============================================================================

/**
 * Tasks table - Local task queue
 *
 * Stores all tasks (both local and remote).
 * Status transitions: pending -> claimed -> running -> (completed | failed | paused | needs_human)
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    prompt: text("prompt").notNull(),
    name: text("name"), // Generated task name (nullable)
    repoId: text("repoId"),
    repoPath: text("repoPath"),
    priority: text("priority", { enum: priorityEnum }).default("medium"),
    status: text("status", { enum: taskStatusEnum }).notNull(),
    failureCode: text("failureCode"),
    needsHumanCode: text("needsHumanCode"),
    needsHumanQuestion: text("needsHumanQuestion"),
    clarificationResponse: text("clarificationResponse"),
    githubIssueUrl: text("githubIssueUrl"),
    branch: text("branch"),
    prUrl: text("prUrl"),
    createdAt: text("createdAt").notNull(),
    claimedAt: text("claimedAt"),
    startedAt: text("startedAt"),
    completedAt: text("completedAt"),
    remoteId: text("remoteId"),
    source: text("source", { enum: sourceEnum }).default("local"),

    // Worktree & Execution Mode Fields
    executionMode: text("executionMode", { enum: executionModeEnum }),
    workDir: text("workDir"),
    baseCommitSha: text("baseCommitSha"),
    originalBranch: text("originalBranch"),

    // Pause/Resume Fields
    pausedAt: text("pausedAt"),
    pauseReason: text("pauseReason", { enum: pauseReasonEnum }),
    humanQuestion: text("humanQuestion"),
    humanResponse: text("humanResponse"),

    // Auto-yes mode (auto-accept Claude prompts)
    autoYes: integer("autoYes", { mode: "boolean" }).default(false),

    // Model selection (overrides workflow default)
    model: text("model"),

    // Workflow fields
    workflowId: text("workflowId"),
    currentStep: integer("currentStep"),
    totalSteps: integer("totalSteps"),
  },
  (table) => [
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_repoId").on(table.repoId),
    index("idx_tasks_source").on(table.source),
    index("idx_tasks_createdAt").on(table.createdAt),
    index("idx_tasks_priority").on(table.priority),
    index("idx_tasks_workflowId").on(table.workflowId),
  ],
);

/**
 * Repos table - Configured repositories
 *
 * Stores local repo configurations for task execution.
 */
export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  defaultBranch: text("defaultBranch").default("main"),
  executionMode: text("executionMode", {
    enum: executionModeConfigEnum,
  }).default("auto"),
  createdAt: text("createdAt").notNull(),
});

/**
 * Sessions table - Execution session metadata
 *
 * Tracks task execution sessions and event logs.
 * Full event streams stored as NDJSON files in ~/.nightshift/sessions/
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    taskId: text("taskId")
      .notNull()
      .references(() => tasks.id),
    runId: text("runId").notNull(),
    eventsPath: text("eventsPath"),
    transcriptPath: text("transcriptPath"),
    startedAt: text("startedAt").notNull(),
    completedAt: text("completedAt"),
    storageKey: text("storageKey"),
    eventCount: integer("eventCount").default(0),
    messageCount: integer("messageCount").default(0),
  },
  (table) => [
    index("idx_sessions_taskId").on(table.taskId),
    index("idx_sessions_startedAt").on(table.startedAt),
  ],
);

/**
 * Repo locks table - Exclusive locking for task coordination
 *
 * Implements exclusive lock pattern for direct mode workflow tasks.
 * Worktree mode tasks don't use locks (always allowed)
 */
export const repoLocks = sqliteTable(
  "repo_locks",
  {
    id: text("id").primaryKey(),
    repoId: text("repoId")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    taskId: text("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["exclusive"] as const }).notNull(),
    acquiredAt: text("acquiredAt").notNull(),
  },
  (table) => [
    index("idx_repo_locks_repoId").on(table.repoId),
    index("idx_repo_locks_taskId").on(table.taskId),
    index("idx_repo_locks_type").on(table.type),
  ],
);

/**
 * Workflows table - Workflow definitions
 *
 * Stores workflow templates and definitions for workflow-type tasks.
 */
export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  definition: text("definition").notNull(), // JSON serialized
  model: text("model"),
  isBuiltin: integer("isBuiltin", { mode: "boolean" }).default(false),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

/**
 * Workflow runs table - Execution history of workflows
 *
 * Tracks individual executions of workflows linked to tasks.
 */
export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflowId")
      .notNull()
      .references(() => workflows.id),
    taskId: text("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    stepResults: text("stepResults"), // JSON serialized
    completedSteps: integer("completedSteps").default(0),
  },
  (table) => [
    index("idx_workflow_runs_taskId").on(table.taskId),
    index("idx_workflow_runs_workflowId").on(table.workflowId),
  ],
);

/**
 * Config table - Daemon configuration key-value store
 *
 * Stores daemon settings (server URL, schedules, preferences, etc.)
 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Sync queue table - Pending uploads for connected mode
 *
 * Tracks entities that need syncing to Convex when connected.
 * Acts as a buffer for offline operation.
 */
export const syncQueue = sqliteTable(
  "sync_queue",
  {
    id: text("id").primaryKey(),
    entityType: text("entityType", { enum: entityTypeEnum }).notNull(),
    entityId: text("entityId").notNull(),
    action: text("action", { enum: syncActionEnum }).notNull(),
    createdAt: text("createdAt").notNull(),
    syncedAt: text("syncedAt"),
  },
  (table) => [
    index("idx_sync_queue_syncedAt").on(table.syncedAt),
    index("idx_sync_queue_entityType").on(table.entityType),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  repo: one(repos, {
    fields: [tasks.repoId],
    references: [repos.id],
  }),
  workflow: one(workflows, {
    fields: [tasks.workflowId],
    references: [workflows.id],
  }),
  sessions: many(sessions),
  workflowRuns: many(workflowRuns),
}));

export const reposRelations = relations(repos, ({ many }) => ({
  tasks: many(tasks),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  task: one(tasks, {
    fields: [sessions.taskId],
    references: [tasks.id],
  }),
}));

export const repoLocksRelations = relations(repoLocks, ({ one }) => ({
  repo: one(repos, {
    fields: [repoLocks.repoId],
    references: [repos.id],
  }),
  task: one(tasks, {
    fields: [repoLocks.taskId],
    references: [tasks.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ many }) => ({
  tasks: many(tasks),
  workflowRuns: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  task: one(tasks, {
    fields: [workflowRuns.taskId],
    references: [tasks.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;

export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type NewSyncQueueItem = typeof syncQueue.$inferInsert;

export type RepoLock = typeof repoLocks.$inferSelect;
export type NewRepoLock = typeof repoLocks.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
