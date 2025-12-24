/**
 * Error Code Constants
 *
 * Defines all error codes used throughout Night Shift.
 * Error codes are UPPER_CASE for consistency and greppability.
 */

// =============================================================================
// Failure Codes (task → FAILED)
// =============================================================================

export const FailureCode = {
  /** Task exceeded configured timeout limit */
  FAILED_TIMEOUT: 'FAILED_TIMEOUT',
  /** Claude API rate limit hit */
  FAILED_RATE_LIMIT: 'FAILED_RATE_LIMIT',
  /** Claude execution error (uncaught exception, SDK error) */
  FAILED_EXECUTION: 'FAILED_EXECUTION',
  /** Environment precheck failed (missing CLI tools, auth, etc.) */
  FAILED_ENV_PRECHECK: 'FAILED_ENV_PRECHECK',
  /** Git operations failed (push, commit, branch creation) */
  FAILED_GIT_OPERATION: 'FAILED_GIT_OPERATION',
  /** Network error (connectivity issues) */
  FAILED_NETWORK: 'FAILED_NETWORK',
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

// =============================================================================
// Needs Human Codes (task → NEEDS_HUMAN)
// =============================================================================

export const NeedsHumanCode = {
  /** Claude needs clarification to proceed */
  NEEDS_HUMAN_CLARIFICATION: 'NEEDS_HUMAN_CLARIFICATION',
  /** Action requires explicit human approval */
  NEEDS_HUMAN_APPROVAL: 'NEEDS_HUMAN_APPROVAL',
  /** Repo has uncommitted changes - user must stash/commit */
  NEEDS_HUMAN_GIT_DIRTY: 'NEEDS_HUMAN_GIT_DIRTY',
  /** Credentials or secrets missing/expired */
  NEEDS_HUMAN_AUTH: 'NEEDS_HUMAN_AUTH',
} as const;

export type NeedsHumanCode =
  (typeof NeedsHumanCode)[keyof typeof NeedsHumanCode];

// =============================================================================
// Combined Error Code Type
// =============================================================================

export const ErrorCode = {
  ...FailureCode,
  ...NeedsHumanCode,
} as const;

export type ErrorCode = FailureCode | NeedsHumanCode;

// =============================================================================
// Error Code Helpers
// =============================================================================

/**
 * Check if an error code indicates a retryable failure
 * (failures that might succeed on retry)
 */
export function isRetryableError(code: ErrorCode): boolean {
  return (
    code === FailureCode.FAILED_RATE_LIMIT ||
    code === FailureCode.FAILED_NETWORK ||
    code === FailureCode.FAILED_TIMEOUT
  );
}

/**
 * Check if an error code is a failure (vs needs_human)
 */
export function isFailureCode(code: ErrorCode): code is FailureCode {
  return code.startsWith('FAILED_');
}

/**
 * Check if an error code requires human intervention
 */
export function isNeedsHumanCode(code: ErrorCode): code is NeedsHumanCode {
  return code.startsWith('NEEDS_HUMAN_');
}

/**
 * Get human-readable message for an error code
 */
export function getErrorMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    [FailureCode.FAILED_TIMEOUT]: 'Task exceeded the configured timeout limit',
    [FailureCode.FAILED_RATE_LIMIT]: 'Claude API rate limit was hit',
    [FailureCode.FAILED_EXECUTION]: 'An error occurred during task execution',
    [FailureCode.FAILED_ENV_PRECHECK]:
      'Environment check failed - missing required tools or configuration',
    [FailureCode.FAILED_GIT_OPERATION]: 'Git operation failed',
    [FailureCode.FAILED_NETWORK]: 'Network connectivity issue',
    [NeedsHumanCode.NEEDS_HUMAN_CLARIFICATION]:
      'Claude needs clarification to proceed',
    [NeedsHumanCode.NEEDS_HUMAN_APPROVAL]:
      'This action requires your approval to proceed',
    [NeedsHumanCode.NEEDS_HUMAN_GIT_DIRTY]:
      'Repository has uncommitted changes - please stash or commit first',
    [NeedsHumanCode.NEEDS_HUMAN_AUTH]:
      'Authentication credentials are missing or expired',
  };
  return messages[code] ?? 'Unknown error';
}
