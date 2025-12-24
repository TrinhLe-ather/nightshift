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
export { tasks, repos, sessions, config, syncQueue } from "./schema/schema";

// Relations
export { tasksRelations, reposRelations, sessionsRelations } from "./schema/schema";

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
  SyncQueueItem,
  NewSyncQueueItem,
} from "./schema/schema";

// Enums
export {
  priorityEnum,
  taskStatusEnum,
  sourceEnum,
  executionModeEnum,
  executionModeConfigEnum,
  pauseReasonEnum,
  entityTypeEnum,
  syncActionEnum,
  type Priority,
  type TaskStatus,
  type Source,
  type ExecutionMode,
  type ExecutionModeConfig,
  type PauseReason,
  type EntityType,
  type SyncAction,
} from "./schema/schema";
