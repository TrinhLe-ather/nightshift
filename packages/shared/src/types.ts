/**
 * TypeScript Types
 *
 * Types inferred from Zod schemas for single source of truth.
 * Also includes additional utility types not covered by schemas.
 */

import type { z } from 'zod';
import type {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  repoSchema,
  createRepoSchema,
  sessionSchema,
  sessionEventEnvelopeSchema,
  configSchema,
  updateConfigSchema,
  prioritySchema,
} from './schemas';
import type { TaskState } from './taskStates';
import type { ErrorCode, FailureCode, NeedsHumanCode } from './errorCodes';
import type { EventType, EventLevel } from './eventTypes';

// =============================================================================
// Schema-Inferred Types
// =============================================================================

/** Full task object */
export type Task = z.infer<typeof taskSchema>;

/** Data required to create a new task */
export type CreateTask = z.infer<typeof createTaskSchema>;

/** Fields that can be updated on a task */
export type UpdateTask = z.infer<typeof updateTaskSchema>;

/** Full repo object */
export type Repo = z.infer<typeof repoSchema>;

/** Data required to add a new repo */
export type CreateRepo = z.infer<typeof createRepoSchema>;

/** Full session object */
export type Session = z.infer<typeof sessionSchema>;

/** Session event envelope (wrapper for all events) */
export type SessionEventEnvelope = z.infer<typeof sessionEventEnvelopeSchema>;

/** Daemon configuration */
export type Config = z.infer<typeof configSchema>;

/** Fields that can be updated in config */
export type UpdateConfig = z.infer<typeof updateConfigSchema>;

/** Task priority level */
export type Priority = z.infer<typeof prioritySchema>;

// =============================================================================
// Re-exports for Convenience
// =============================================================================

export type { TaskState, ErrorCode, FailureCode, NeedsHumanCode };
export type { EventType, EventLevel };

// =============================================================================
// Additional Utility Types
// =============================================================================

/** Operating mode of the daemon */
export type OperatingMode = 'standalone' | 'connected' | 'hybrid';

/** PC status (for Control Center) */
export type PcStatus = 'online' | 'offline' | 'working' | 'scheduled' | 'rate_limited';

/** Daemon status for local UI */
export interface DaemonStatus {
  running: boolean;
  version: string;
  mode: OperatingMode;
  port: number;
  activeTask: Task | null;
  repoCount: number;
  pendingTasks: number;
  uptime: number;
}

/** Task with session info for UI display */
export interface TaskWithSession extends Task {
  session?: Session;
}

/** API success response */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** API error response */
export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
}

/** API response (success or error) */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Pagination params for list endpoints */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** Task filter params for list endpoint */
export interface TaskFilterParams extends PaginationParams {
  status?: TaskState | TaskState[];
  repoId?: string;
  priority?: Priority | Priority[];
}

/** GitHub issue info extracted from URL */
export interface GitHubIssueInfo {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/** GitHub PR info */
export interface GitHubPrInfo {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title?: string;
}

/** Session event with typed data payloads */
export interface SessionEvent<T = Record<string, unknown>>
  extends Omit<SessionEventEnvelope, 'data'> {
  data: T;
}

/** Preflight check result */
export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
}

/** Individual preflight check */
export interface PreflightCheck {
  name: string;
  passed: boolean;
  message?: string;
  errorCode?: ErrorCode;
}

/** Update info from releases endpoint */
export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  checksum: string;
  releaseNotes?: string;
  publishedAt: string;
  /** Whether this is a prerelease (beta, rc, canary) */
  isPrerelease?: boolean;
}

/** Repo lock info */
export interface RepoLock {
  repoId: string;
  taskId: string;
  acquiredAt: string;
  pid: number;
}
