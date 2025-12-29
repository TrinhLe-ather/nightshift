/**
 * NightShift Shared Contracts
 *
 * Cross-boundary types, constants, and schemas shared between packages.
 * All packages (daemon, admin, backend) import from here.
 */

export { VERSION, BUILD_COMMIT, BUILD_DATE, getVersionDisplay } from "./version";

// =============================================================================
// Task States
// (exports both const objects and their corresponding types)
// =============================================================================

export {
  TaskState,
  TERMINAL_STATES,
  ACTIVE_STATES,
  isTerminalState,
  isActiveState,
  isRetryableState,
  isCancelableState,
  isResumableState,
  isPausableState,
} from "./taskStates";

// =============================================================================
// Error Codes
// (exports both const objects and their corresponding types)
// =============================================================================

export {
  FailureCode,
  NeedsHumanCode,
  ErrorCode,
  isRetryableError,
  isFailureCode,
  isNeedsHumanCode,
  getErrorMessage,
} from "./errorCodes";

// =============================================================================
// Event Types
// (exports both const objects and their corresponding types)
// =============================================================================

export {
  PcEventType,
  TaskEventType,
  PreflightEventType,
  RepoEventType,
  AgentEventType,
  ArtifactEventType,
  SessionEventType,
  EventType,
  EventLevel,
} from "./eventTypes";

// =============================================================================
// Zod Schemas
// =============================================================================

export {
  // Enum schemas
  prioritySchema,
  taskStateSchema,
  eventLevelSchema,
  executionModeSchema,
  executionModeConfigSchema,
  pauseReasonSchema,
  // Task schemas
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  // Repo schemas
  repoSchema,
  createRepoSchema,
  // Session schemas
  sessionSchema,
  sessionEventEnvelopeSchema,
  // Config schemas
  configSchema,
  updateConfigSchema,
  // API response schemas
  apiSuccessSchema,
  apiErrorSchema,
  apiResponseSchema,
} from "./schemas";

export type {
  Priority,
  ExecutionMode,
  ExecutionModeConfig,
  PauseReason,
  ClaudeModel,
  UpdateChannel,
} from "./schemas";

export { modelSchema, updateChannelSchema, themeSchema } from "./schemas";

export type { Theme } from "./schemas";

// =============================================================================
// TypeScript Types
// =============================================================================

export type {
  // Schema-inferred types
  Task,
  CreateTask,
  UpdateTask,
  Repo,
  CreateRepo,
  Session,
  SessionEventEnvelope,
  Config,
  UpdateConfig,
  // Utility types
  OperatingMode,
  PcStatus,
  DaemonStatus,
  TaskWithSession,
  ApiSuccess,
  ApiError,
  ApiResponse,
  PaginationParams,
  TaskFilterParams,
  GitHubIssueInfo,
  GitHubPrInfo,
  SessionEvent,
  PreflightResult,
  PreflightCheck,
  UpdateInfo,
  RepoLock,
} from "./types";
