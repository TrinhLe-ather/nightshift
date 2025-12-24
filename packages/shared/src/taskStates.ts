/**
 * Task State Constants
 *
 * Defines all possible states for a Night Shift task.
 * Used across daemon, local UI, and Control Center.
 */

export const TaskState = {
  /** Task created, waiting in queue */
  PENDING: 'pending',
  /** Task claimed by a PC, preflight starting */
  CLAIMED: 'claimed',
  /** Task actively executing with Claude */
  RUNNING: 'running',
  /** Task paused (can be resumed) */
  PAUSED: 'paused',
  /** Task finished successfully */
  COMPLETED: 'completed',
  /** Task failed (see failureCode for reason) */
  FAILED: 'failed',
  /** Task blocked on human input (see needsHumanCode) - deprecated, use PAUSED */
  NEEDS_HUMAN: 'needs_human',
  /** Task canceled by user */
  CANCELED: 'canceled',
} as const;

export type TaskState = (typeof TaskState)[keyof typeof TaskState];

/** States where the task has reached a final outcome */
export const TERMINAL_STATES: readonly TaskState[] = [
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELED,
] as const;

/** States where the task is actively being processed */
export const ACTIVE_STATES: readonly TaskState[] = [
  TaskState.CLAIMED,
  TaskState.RUNNING,
] as const;

/**
 * Check if a task state is terminal (no more processing will occur)
 */
export function isTerminalState(state: TaskState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/**
 * Check if a task state is active (currently being processed)
 */
export function isActiveState(state: TaskState): boolean {
  return (ACTIVE_STATES as readonly string[]).includes(state);
}

/**
 * Check if a task can be retried from its current state
 */
export function isRetryableState(state: TaskState): boolean {
  return state === TaskState.FAILED || state === TaskState.CANCELED;
}

/**
 * Check if a task can be resumed from its current state
 */
export function isResumableState(state: TaskState): boolean {
  return state === TaskState.PAUSED || state === TaskState.NEEDS_HUMAN;
}

/**
 * Check if a task can be paused from its current state
 */
export function isPausableState(state: TaskState): boolean {
  return state === TaskState.RUNNING;
}

/**
 * Check if a task can be canceled from its current state
 */
export function isCancelableState(state: TaskState): boolean {
  return (
    state === TaskState.PENDING ||
    state === TaskState.CLAIMED ||
    state === TaskState.RUNNING ||
    state === TaskState.NEEDS_HUMAN
  );
}
