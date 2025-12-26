/**
 * Session Event Type Constants
 *
 * Defines all event types used in session logging.
 * Event types are UPPER_CASE for consistency with error codes.
 */

// =============================================================================
// PC Events
// =============================================================================

export const PcEventType = {
  /** Heartbeat sent to server (connected mode) */
  PC_HEARTBEAT_SENT: 'PC_HEARTBEAT_SENT',
  /** PC eligibility for tasks changed */
  PC_ELIGIBILITY_CHANGED: 'PC_ELIGIBILITY_CHANGED',
  /** PC started up */
  PC_STARTED: 'PC_STARTED',
  /** PC shutting down */
  PC_STOPPING: 'PC_STOPPING',
} as const;

export type PcEventType = (typeof PcEventType)[keyof typeof PcEventType];

// =============================================================================
// Task Lifecycle Events
// =============================================================================

export const TaskEventType = {
  /** Task was claimed by this PC */
  TASK_CLAIMED: 'TASK_CLAIMED',
  /** Task execution started */
  TASK_STARTED: 'TASK_STARTED',
  /** Task state changed (includes from/to/reasonCode) */
  TASK_STATE_CHANGED: 'TASK_STATE_CHANGED',
  /** Task completed successfully */
  TASK_COMPLETED: 'TASK_COMPLETED',
  /** Task failed */
  TASK_FAILED: 'TASK_FAILED',
  /** Task was canceled */
  TASK_CANCELED: 'TASK_CANCELED',
  /** Task was paused (manual, needs_human, or rate_limit) */
  TASK_PAUSED: 'TASK_PAUSED',
  /** Task was resumed after pause */
  TASK_RESUMED: 'TASK_RESUMED',
} as const;

export type TaskEventType =
  (typeof TaskEventType)[keyof typeof TaskEventType];

// =============================================================================
// Preflight Events
// =============================================================================

export const PreflightEventType = {
  /** Preflight checks starting */
  PREFLIGHT_STARTED: 'PREFLIGHT_STARTED',
  /** All preflight checks passed */
  PREFLIGHT_PASSED: 'PREFLIGHT_PASSED',
  /** Preflight check failed (includes error code) */
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
} as const;

export type PreflightEventType =
  (typeof PreflightEventType)[keyof typeof PreflightEventType];

// =============================================================================
// Repo Events
// =============================================================================

export const RepoEventType = {
  /** Repo lock acquired for exclusive access */
  REPO_LOCK_ACQUIRED: 'REPO_LOCK_ACQUIRED',
  /** Repo lock released */
  REPO_LOCK_RELEASED: 'REPO_LOCK_RELEASED',
  /** Git branch created */
  REPO_BRANCH_CREATED: 'REPO_BRANCH_CREATED',
  /** Git checkout performed */
  REPO_CHECKOUT: 'REPO_CHECKOUT',
  /** Git worktree created */
  WORKTREE_CREATED: 'WORKTREE_CREATED',
  /** Git worktree removed */
  WORKTREE_REMOVED: 'WORKTREE_REMOVED',
  /** Diff computed from base commit */
  DIFF_COMPUTED: 'DIFF_COMPUTED',
} as const;

export type RepoEventType =
  (typeof RepoEventType)[keyof typeof RepoEventType];

// =============================================================================
// Agent (Claude) Events
// =============================================================================

export const AgentEventType = {
  /** Claude agent started executing */
  AGENT_STARTED: 'AGENT_STARTED',
  /** Agent needs human input to continue */
  AGENT_NEEDS_HUMAN: 'AGENT_NEEDS_HUMAN',
  /** Agent received clarification and resuming */
  AGENT_RESUMED: 'AGENT_RESUMED',
  /** Agent tool call (for detailed logging) */
  AGENT_TOOL_CALL: 'AGENT_TOOL_CALL',
  /** Agent tool result */
  AGENT_TOOL_RESULT: 'AGENT_TOOL_RESULT',
  /** Agent message/response */
  AGENT_MESSAGE: 'AGENT_MESSAGE',
} as const;

export type AgentEventType =
  (typeof AgentEventType)[keyof typeof AgentEventType];

// =============================================================================
// Artifact Events
// =============================================================================

export const ArtifactEventType = {
  /** Git commit created */
  ARTIFACT_COMMIT_CREATED: 'ARTIFACT_COMMIT_CREATED',
  /** Pull request created */
  ARTIFACT_PR_CREATED: 'ARTIFACT_PR_CREATED',
  /** File modified */
  ARTIFACT_FILE_MODIFIED: 'ARTIFACT_FILE_MODIFIED',
} as const;

export type ArtifactEventType =
  (typeof ArtifactEventType)[keyof typeof ArtifactEventType];

// =============================================================================
// Session Events
// =============================================================================

export const SessionEventType = {
  /** Session log uploaded to cloud storage */
  SESSION_UPLOADED: 'SESSION_UPLOADED',
  /** Session started */
  SESSION_STARTED: 'SESSION_STARTED',
  /** Session ended */
  SESSION_ENDED: 'SESSION_ENDED',
} as const;

export type SessionEventType =
  (typeof SessionEventType)[keyof typeof SessionEventType];

// =============================================================================
// Workflow Events
// =============================================================================

export const WorkflowEventType = {
  /** Workflow step started executing */
  WORKFLOW_STEP_STARTED: 'WORKFLOW_STEP_STARTED',
  /** Workflow step completed successfully */
  WORKFLOW_STEP_COMPLETED: 'WORKFLOW_STEP_COMPLETED',
  /** Workflow step failed */
  WORKFLOW_STEP_FAILED: 'WORKFLOW_STEP_FAILED',
  /** Checkpoint restored from previous execution */
  CHECKPOINT_RESTORED: 'CHECKPOINT_RESTORED',
} as const;

export type WorkflowEventType =
  (typeof WorkflowEventType)[keyof typeof WorkflowEventType];

// =============================================================================
// Combined Event Type
// =============================================================================

export const EventType = {
  ...PcEventType,
  ...TaskEventType,
  ...PreflightEventType,
  ...RepoEventType,
  ...AgentEventType,
  ...ArtifactEventType,
  ...SessionEventType,
  ...WorkflowEventType,
} as const;

export type EventType =
  | PcEventType
  | TaskEventType
  | PreflightEventType
  | RepoEventType
  | AgentEventType
  | ArtifactEventType
  | SessionEventType
  | WorkflowEventType;

// =============================================================================
// Event Levels
// =============================================================================

export const EventLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
} as const;

export type EventLevel = (typeof EventLevel)[keyof typeof EventLevel];
