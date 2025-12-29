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

export const eventLevelSchema = z.enum(["info", "warn", "error", "debug"]);

export const modelSchema = z.enum(["haiku", "sonnet", "opus"]).optional();

export type ClaudeModel = z.infer<typeof modelSchema>;

export const updateChannelSchema = z.enum(["stable", "latest"]);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;

export const themeSchema = z.enum([
  "light",
  "dark",
  "solarized-light",
  "solarized-dark",
  "system",
]);
export type Theme = z.infer<typeof themeSchema>;

// =============================================================================
// Task Schema
// =============================================================================

export const taskSchema = z.object({
  /** Unique task identifier */
  id: z.string(),
  /** Task description/prompt text */
  prompt: z.string(),
  /** Generated task name (max 50 chars) */
  name: z.string().nullable(),
  /** Reference to repo by ID */
  repoId: z.string().nullable(),
  /** Absolute path to repo (denormalized for quick access) */
  repoPath: z.string().nullable(),
  /** Task priority level */
  priority: prioritySchema,
  /** Current task state */
  status: taskStateSchema,
  /** Error code when status=failed */
  failureCode: z.string().nullable(),
  /** Optional GitHub issue link for context */
  githubIssueUrl: z.string().nullable(),
  /** Git branch for task */
  branch: z.string().nullable(),
  /** Created PR URL */
  prUrl: z.string().nullable(),
  /** ISO-8601 timestamp when task was created */
  createdAt: z.string(),
  /** ISO-8601 timestamp when task was claimed */
  claimedAt: z.string().nullable(),
  /** ISO-8601 timestamp when execution started */
  startedAt: z.string().nullable(),
  /** ISO-8601 timestamp when task completed/failed */
  completedAt: z.string().nullable(),

  // === Worktree & Execution Mode Fields ===
  /** Resolved execution mode for this task */
  executionMode: executionModeSchema.nullable(),
  /** Working directory (worktree path or repo path) */
  workDir: z.string().nullable(),
  /** SHA of commit when task started (for diffs) */
  baseCommitSha: z.string().nullable(),
  /** Original branch before task started (direct mode) */
  originalBranch: z.string().nullable(),

  // === Pause/Resume Fields ===
  /** ISO-8601 timestamp when task was paused */
  pausedAt: z.string().nullable(),
  /** Reason for pause */
  pauseReason: pauseReasonSchema.nullable(),
  /** Question from Claude requiring human input */
  humanQuestion: z.string().nullable(),
  /** User's response to continue execution */
  humanResponse: z.string().nullable(),

  // === Auto-Yes Mode ===
  /** Enable auto-yes mode to auto-accept Claude prompts */
  autoYes: z.boolean().nullable(),

  // === Model Selection ===
  /** Claude model to use for execution (overrides workflow default) */
  model: z.string().nullable(),

  // === Workflow Fields ===
  /** Reference to workflow definition */
  workflowId: z.string().nullable(),
  /** Current step in workflow (0-indexed) */
  currentStep: z.number().int().nullable(),
  /** Total number of steps in workflow */
  totalSteps: z.number().int().nullable(),

  // === Session Resume Fields (Continue Task Feature) ===
  /** Claude SDK session ID for resuming conversations */
  sdkSessionId: z.string().nullable(),
  /** Follow-up prompt when continuing a completed/failed task */
  continuePrompt: z.string().nullable(),
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
  workflowId: true,
});

export const updateTaskSchema = taskSchema
  .pick({
    status: true,
    name: true,
    priority: true,
    failureCode: true,
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
    // Session resume fields
    sdkSessionId: true,
    continuePrompt: true,
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
  /** Enable LAN access (bind to 0.0.0.0 for mobile device connections) */
  allowLan: z.boolean().default(false),
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
  /** Terminal shell ID (auto = system default) */
  terminalShell: z.string().default("auto"),
  /** Update channel: stable (default) or latest (includes prereleases) */
  updateChannel: updateChannelSchema.default("stable"),
  /** UI theme preference */
  theme: themeSchema.default("dark"),
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
