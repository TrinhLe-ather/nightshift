/**
 * Drizzle Module - Barrel Export
 *
 * Exports database client, schema, and types
 */

// Database client
export {
  initDb,
  getDb,
  getSqlite,
  closeDb,
  isDbInitialized,
  getDbStats,
  checkDbHealth,
  runMigrations,
  type DrizzleDb,
  type InitDbOptions,
  type DbStats,
  type MigrationResult,
} from "./client";

// Schema tables
export { tasks, repos, sessions, config, workflows, workflowRuns, repoLocks } from "./schema/schema";

// Relations
export { tasksRelations, reposRelations, sessionsRelations, workflowsRelations, workflowRunsRelations, repoLocksRelations } from "./schema/schema";

// Types (inferred from schema)
export type {
  Task,
  NewTask,
  Repo,
  NewRepo,
  Session,
  NewSession,
  Config,
  NewConfig,
  Workflow,
  NewWorkflow,
  WorkflowRun,
  NewWorkflowRun,
  RepoLock,
  NewRepoLock,
} from "./schema/schema";

// Enums
export {
  priorityEnum,
  taskStatusEnum,
  executionModeEnum,
  executionModeConfigEnum,
  pauseReasonEnum,
  type Priority,
  type TaskStatus,
  type ExecutionMode,
  type ExecutionModeConfig,
  type PauseReason,
} from "./schema/schema";
