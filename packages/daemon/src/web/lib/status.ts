/**
 * Shared status styling utilities
 *
 * Provides consistent status colors and styling across all pages.
 */

export interface StatusStyle {
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Get styling for a task status
 */
export function getStatusStyle(status: string): StatusStyle {
  switch (status) {
    case "pending":
    case "claimed":
      return {
        color: "text-sky-400",
        bgColor: "bg-sky-500/10",
        borderColor: "border-sky-500/30",
      };
    case "running":
      return {
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary/30",
      };
    case "completed":
      return {
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
      };
    case "failed":
      return {
        color: "text-rose-400",
        bgColor: "bg-rose-500/10",
        borderColor: "border-rose-500/30",
      };
    case "paused":
    case "needs_human":
      return {
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
      };
    case "canceled":
      return {
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
      };
    default:
      return {
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
      };
  }
}

/**
 * Map status to Badge variant
 */
export const statusToVariant: Record<
  string,
  "pending" | "running" | "completed" | "failed" | "canceled" | "paused"
> = {
  pending: "pending",
  claimed: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  needs_human: "paused",
  paused: "paused",
  canceled: "canceled",
};

/**
 * Get styling for task priority
 */
export function getPriorityStyle(priority: string): StatusStyle {
  switch (priority) {
    case "urgent":
      return {
        color: "text-rose-400",
        bgColor: "bg-rose-500/10",
        borderColor: "border-rose-500/30",
      };
    case "high":
      return {
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
      };
    case "medium":
      return {
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary/30",
      };
    case "low":
      return {
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
      };
    default:
      return {
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary/30",
      };
  }
}

/**
 * Get styling for execution mode
 */
export function getExecutionModeStyle(mode: string | null): StatusStyle & { label: string } {
  switch (mode) {
    case "worktree":
      return {
        color: "text-violet-400",
        bgColor: "bg-violet-500/10",
        borderColor: "border-violet-500/30",
        label: "Worktree",
      };
    case "direct":
      return {
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        label: "Direct",
      };
    default:
      return {
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        label: "Auto",
      };
  }
}

/**
 * Get styling for workflow type based on name/description
 */
export function getWorkflowTypeStyle(
  name: string,
  description: string,
): StatusStyle & { type: string } {
  const lower = (name + " " + description).toLowerCase();

  if (lower.includes("bug") || lower.includes("fix") || lower.includes("investigate")) {
    return {
      type: "fix",
      color: "text-rose-400",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/30",
    };
  }
  if (lower.includes("refactor") || lower.includes("quality") || lower.includes("clean")) {
    return {
      type: "refactor",
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/30",
    };
  }
  if (lower.includes("quick") || lower.includes("simple") || lower.includes("task")) {
    return {
      type: "quick",
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/30",
    };
  }
  if (lower.includes("doc") || lower.includes("readme") || lower.includes("comment")) {
    return {
      type: "docs",
      color: "text-sky-400",
      bgColor: "bg-sky-500/10",
      borderColor: "border-sky-500/30",
    };
  }
  if (lower.includes("test") || lower.includes("spec")) {
    return {
      type: "test",
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
    };
  }
  return {
    type: "workflow",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
  };
}
