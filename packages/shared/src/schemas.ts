/**
 * Zod Validation Schemas
 *
 * Defines validation schemas for all data models.
 * Types are inferred from schemas for single source of truth.
 */

import { z } from "zod";

// =============================================================================
// Enums & Literals
// =============================================================================

export const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type Priority = z.infer<typeof prioritySchema>;

export const taskStateSchema = z.enum([
  "pending",
  "claimed",
  "running",
  "paused",
  "completed",
  "failed",
  "needs_human",
  "canceled",
]);

export const executionModeSchema = z.enum(["worktree", "direct"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const executionModeConfigSchema = z.enum(["auto", "worktree", "direct"]);
export type ExecutionModeConfig = z.infer<typeof executionModeConfigSchema>;

export const pauseReasonSchema = z.enum(["manual", "needs_human", "rate_limit"]);
export type PauseReason = z.infer<typeof pauseReasonSchema>;

export const taskSourceSchema = z.enum(["local", "remote"]);
export type TaskSource = z.infer<typeof taskSourceSchema>;

export const eventLevelSchema = z.enum(["info", "warn", "error", "debug"]);

export const modelSchema = z.enum(["haiku", "sonnet", "opus"]).optional();

export type ClaudeModel = z.infer<typeof modelSchema>;

// =============================================================================
// Task Schema
// =============================================================================

export const taskSchema = z.object({
  /** Unique task identifier */
  id: z.string(),
  /** Task description/prompt text */
  prompt: z.string().min(1, "Prompt is required"),
  /** Generated task name (max 50 chars) */
  name: z.string().max(50).optional(),
  /** Reference to repo by ID */
  repoId: z.string().optional(),
  /** Absolute path to repo (denormalized for quick access) */
  repoPath: z.string().optional(),
  /** Task priority level */
  priority: prioritySchema.default("medium"),
  /** Current task state */
  status: taskStateSchema,
  /** Error code when status=failed */
  failureCode: z.string().optional(),
  /** Error code when status=needs_human */
  needsHumanCode: z.string().optional(),
  /** Question for user when needs_human */
  needsHumanQuestion: z.string().optional(),
  /** User's response to clarification */
  clarificationResponse: z.string().optional(),
  /** Optional GitHub issue link for context */
  githubIssueUrl: z.string().url().optional(),
  /** Git branch for task */
  branch: z.string().optional(),
  /** Created PR URL */
  prUrl: z.string().url().optional(),
  /** ISO-8601 timestamp when task was created */
  createdAt: z.string().datetime(),
  /** ISO-8601 timestamp when task was claimed */
  claimedAt: z.string().datetime().optional(),
  /** ISO-8601 timestamp when execution started */
  startedAt: z.string().datetime().optional(),
  /** ISO-8601 timestamp when task completed/failed */
  completedAt: z.string().datetime().optional(),
  /** Convex ID if synced (connected mode) */
  remoteId: z.string().optional(),
  /** Whether task originated locally or from remote */
  source: taskSourceSchema.default("local"),

  // === Worktree & Execution Mode Fields ===
  /** Resolved execution mode for this task */
  executionMode: executionModeSchema.optional(),
  /** Working directory (worktree path or repo path) */
  workDir: z.string().optional(),
  /** SHA of commit when task started (for diffs) */
  baseCommitSha: z.string().optional(),
  /** Original branch before task started (direct mode) */
  originalBranch: z.string().optional(),

  // === Pause/Resume Fields ===
  /** ISO-8601 timestamp when task was paused */
  pausedAt: z.string().datetime().optional(),
  /** Reason for pause */
  pauseReason: pauseReasonSchema.optional(),
  /** Question from Claude requiring human input */
  humanQuestion: z.string().optional(),
  /** User's response to continue execution */
  humanResponse: z.string().optional(),

  // === Auto-Yes Mode ===
  /** Enable auto-yes mode to auto-accept Claude prompts */
  autoYes: z.boolean().default(false),

  // === Model Selection ===
  /** Claude model to use for execution (overrides workflow default) */
  model: modelSchema,

  // === Workflow Fields ===
  /** Reference to workflow definition */
  workflowId: z.string().optional(),
  /** Current step in workflow (0-indexed) */
  currentStep: z.number().int().nonnegative().optional(),
  /** Total number of steps in workflow */
  totalSteps: z.number().int().nonnegative().optional(),
});

export const createTaskSchema = taskSchema.pick({
  prompt: true,
  repoId: true,
  repoPath: true,
  priority: true,
  githubIssueUrl: true,
  branch: true,
  autoYes: true,
  model: true,
});

export const updateTaskSchema = taskSchema
  .pick({
    status: true,
    name: true,
    priority: true,
    clarificationResponse: true,
    failureCode: true,
    needsHumanCode: true,
    needsHumanQuestion: true,
    prUrl: true,
    claimedAt: true,
    startedAt: true,
    completedAt: true,
    // Worktree fields
    executionMode: true,
    workDir: true,
    baseCommitSha: true,
    originalBranch: true,
    branch: true,
    // Pause fields
    pausedAt: true,
    pauseReason: true,
    humanQuestion: true,
    humanResponse: true,
    // Auto-yes mode
    autoYes: true,
    // Model selection
    model: true,
    // Workflow fields
    workflowId: true,
    currentStep: true,
    totalSteps: true,
  })
  .partial();

// =============================================================================
// Repo Schema
// =============================================================================

export const repoSchema = z.object({
  /** Unique repo identifier */
  id: z.string(),
  /** Display name (from git remote) */
  name: z.string().min(1, "Name is required"),
  /** Absolute filesystem path */
  path: z.string().min(1, "Path is required"),
  /** Default branch (e.g., "main") */
  defaultBranch: z.string().default("main"),
  /** Execution mode configuration: auto, worktree, or direct */
  executionMode: executionModeConfigSchema.default("auto"),
  /** ISO-8601 timestamp when repo was added */
  createdAt: z.string().datetime(),
});

export const createRepoSchema = repoSchema.pick({
  path: true,
});

// =============================================================================
// Session Schema
// =============================================================================

export const sessionSchema = z.object({
  /** Unique session identifier */
  id: z.string(),
  /** Reference to task */
  taskId: z.string(),
  /** Unique execution run ID */
  runId: z.string(),
  /** Path to NDJSON event stream file */
  eventsPath: z.string().optional(),
  /** ISO-8601 timestamp when session started */
  startedAt: z.string().datetime(),
  /** ISO-8601 timestamp when session ended */
  completedAt: z.string().datetime().optional(),
  /** R2/S3 storage key if uploaded (connected mode) */
  storageKey: z.string().optional(),
  /** Number of events in session */
  eventCount: z.number().int().nonnegative().default(0),
});

// =============================================================================
// Session Event Envelope Schema
// =============================================================================

export const sessionEventEnvelopeSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.number().int().positive().default(1),
  /** ISO-8601 UTC timestamp */
  ts: z.string().datetime(),
  /** Sequence number for ordering */
  seq: z.number().int().nonnegative(),
  /** Event severity level */
  level: eventLevelSchema,
  /** UPPER_CASE event type */
  type: z.string(),
  /** Organization ID (connected mode) */
  orgId: z.string().optional(),
  /** Task reference */
  taskId: z.string(),
  /** PC that executed */
  pcId: z.string().optional(),
  /** User who created task */
  userId: z.string().optional(),
  /** Unique execution run ID */
  runId: z.string(),
  /** Event-specific payload */
  data: z.record(z.string(), z.unknown()).default({}),
});

// =============================================================================
// Config Schema
// =============================================================================

export const configSchema = z.object({
  /** Port for local web UI */
  port: z.number().int().min(1024).max(65535).default(3847),
  /** Task timeout in milliseconds */
  taskTimeoutMs: z
    .number()
    .int()
    .positive()
    .default(4 * 60 * 60 * 1000), // 4 hours
  /** Whether local queue is enabled */
  localQueueEnabled: z.boolean().default(true),
  /** Whether remote queue is enabled (connected mode) */
  remoteQueueEnabled: z.boolean().default(false),
  /** Control Center server URL (connected mode) */
  serverUrl: z.string().url().optional(),
  /** Schedule start time (HH:mm format) */
  scheduleStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  /** Schedule end time (HH:mm format) */
  scheduleEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  /** Maximum concurrent tasks per repo (default 1) */
  maxConcurrentTasks: z.number().int().min(1).max(10).default(1),
});

export const updateConfigSchema = configSchema.partial();

// =============================================================================
// API Response Schemas
// =============================================================================

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
  });

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean().optional(),
  }),
});

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([apiSuccessSchema(dataSchema), apiErrorSchema]);
