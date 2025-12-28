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
export {
  tasks,
  repos,
  sessions,
  config,
  syncQueue,
  workflows,
  workflowRuns,
  repoLocks,
  narrativeProjects,
  narrativeDocuments,
  narrativeDocumentVersions,
} from "./schema/schema";

// Relations
export {
  tasksRelations,
  reposRelations,
  sessionsRelations,
  workflowsRelations,
  workflowRunsRelations,
  repoLocksRelations,
  narrativeProjectsRelations,
  narrativeDocumentsRelations,
  narrativeDocumentVersionsRelations,
} from "./schema/schema";

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
  NarrativeProject,
  NewNarrativeProject,
  NarrativeDocument,
  NewNarrativeDocument,
  NarrativeDocumentVersion,
  NewNarrativeDocumentVersion,
} from "./schema/schema";

// Enums
export {
  priorityEnum,
  taskStatusEnum,
  executionModeEnum,
  executionModeConfigEnum,
  pauseReasonEnum,
  entityTypeEnum,
  syncActionEnum,
  projectStatusEnum,
  projectPhaseEnum,
  documentTypeEnum,
  documentStatusEnum,
  type Priority,
  type TaskStatus,
  type ExecutionMode,
  type ExecutionModeConfig,
  type PauseReason,
  type EntityType,
  type SyncAction,
  type ProjectStatus,
  type ProjectPhase,
  type DocumentType,
  type DocumentStatus,
} from "./schema/schema";
