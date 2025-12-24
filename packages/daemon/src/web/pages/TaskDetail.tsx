/**
 * Task Detail Page
 *
 * Shows full task details, status timeline, and session log.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCancelTask, usePauseTask, useResumeTask, useTask, useTaskDiff } from "@/hooks/useTasks";
import { useSession } from "@/hooks/useSessions";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionLogViewer } from "@/components/SessionLogViewer";
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitPullRequest,
  Info,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  XCircle,
} from "lucide-react";

const statusToVariant: Record<
  string,
  "pending" | "running" | "completed" | "failed" | "canceled" | "paused" | "warning"
> = {
  pending: "pending",
  claimed: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  needs_human: "warning",
  paused: "paused",
  canceled: "canceled",
};

const priorityToVariant: Record<string, "low" | "medium" | "high" | "urgent"> = {
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function formatDuration(startStr: string, endStr?: string | null): string {
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diffMs = end - start;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const taskId = id ?? "";

  const { data: task, isLoading, error } = useTask(taskId);
  const { data: session, isLoading: sessionLoading } = useSession(taskId);
  const { data: diffStats } = useTaskDiff(taskId, !!task?.baseCommitSha);
  const cancelTask = useCancelTask();
  const pauseTask = usePauseTask();
  const resumeTask = useResumeTask();

  const [humanResponse, setHumanResponse] = useState("");

  const handleCancel = async () => {
    if (!task) return;

    try {
      await cancelTask.mutateAsync(task.id);
      addToast({
        title: "Task canceled",
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: "Failed to cancel task",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  };

  const handlePause = async () => {
    if (!task) return;

    try {
      await pauseTask.mutateAsync({ id: task.id, reason: "manual" });
      addToast({
        title: "Task paused",
        description: "Work has been saved. You can resume later.",
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: "Failed to pause task",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  };

  const handleResume = async () => {
    if (!task) return;

    try {
      await resumeTask.mutateAsync({
        id: task.id,
        response: humanResponse || undefined,
      });
      setHumanResponse("");
      addToast({
        title: "Task resumed",
        description: "Task is now running again.",
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: "Failed to resume task",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6">
        <Link
          to="/tasks"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </Link>

        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <AlertCircle className="mb-4 h-12 w-12 text-[var(--color-destructive)]" />
          <p className="text-lg text-[var(--color-text-secondary)]">Task not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/tasks")}>
            Go to Tasks
          </Button>
        </div>
      </div>
    );
  }

  const isPending = task.status === "pending";
  const isRunning = task.status === "running" || task.status === "claimed";
  const isPaused = task.status === "paused";
  const isNeedsHuman = task.status === "needs_human";
  const isTerminal = ["completed", "failed", "canceled"].includes(task.status);
  const canPause = isRunning;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            to="/tasks"
            className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tasks
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Task #{task.id}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={statusToVariant[task.status] ?? "secondary"}
            className={isRunning ? "animate-pulse" : ""}
          >
            {task.status.toLowerCase().replace("_", " ")}
          </Badge>
          <Badge variant={priorityToVariant[task.priority ?? "medium"] ?? "medium"}>
            {(task.priority ?? "medium").toLowerCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prompt */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">Prompt</h2>
            <p className="whitespace-pre-wrap text-[var(--color-text-primary)]">{task.prompt}</p>
          </div>

          {/* GitHub Issue Preview */}
          {task.githubIssueUrl && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">
                Linked GitHub Issue
              </h2>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-[var(--color-text-muted)]" />
                <a
                  href={task.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                >
                  {task.githubIssueUrl}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Status message */}
          {isPending && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 p-4">
              <Clock className="h-5 w-5 text-[var(--color-info)]" />
              <p className="text-sm text-[var(--color-text-secondary)]">Waiting in queue...</p>
            </div>
          )}

          {isRunning && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Task in progress
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Running for {formatDuration(task.createdAt, null)}
                </p>
              </div>
            </div>
          )}

          {/* Paused - Needs Human Input */}
          {(isPaused || isNeedsHuman) && task.pauseReason === "needs_human" && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="h-5 w-5 text-[var(--color-warning)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Waiting for your input
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Claude needs clarification to continue
                  </p>
                </div>
              </div>

              {task.humanQuestion && (
                <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 border border-[var(--color-border)]">
                  <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                    Claude's Question:
                  </p>
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
                    {task.humanQuestion}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">
                  Your Response:
                </label>
                <textarea
                  value={humanResponse}
                  onChange={(e) => setHumanResponse(e.target.value)}
                  placeholder="Provide clarification or instructions for Claude..."
                  className="w-full min-h-[100px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <Button onClick={handleResume} disabled={resumeTask.isPending} className="w-full">
                  {resumeTask.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Resume with Response
                </Button>
              </div>
            </div>
          )}

          {/* Paused - Manual */}
          {isPaused && task.pauseReason === "manual" && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4">
              <Pause className="h-5 w-5 text-[var(--color-warning)]" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Task paused</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Work has been saved. Resume when ready.
                </p>
              </div>
              <Button size="sm" onClick={handleResume} disabled={resumeTask.isPending}>
                {resumeTask.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Resume
              </Button>
            </div>
          )}

          {/* Paused - Rate Limit */}
          {isPaused && task.pauseReason === "rate_limit" && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-orange-500/30 bg-orange-500/10 p-4">
              <Clock className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Rate limited</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Waiting for API cooldown. You can resume manually.
                </p>
              </div>
              <Button size="sm" onClick={handleResume} disabled={resumeTask.isPending}>
                {resumeTask.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Retry
              </Button>
            </div>
          )}

          {/* Legacy NEEDS_HUMAN without pauseReason */}
          {isNeedsHuman && !task.pauseReason && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4">
              <AlertCircle className="h-5 w-5 text-[var(--color-warning)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Needs your input
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {task.needsHumanCode}: Check session log for details
                </p>
              </div>
            </div>
          )}

          {/* Session Log - show for running or completed tasks */}
          {(isRunning || isTerminal) && (
            <SessionLogViewer
              events={session?.events ?? []}
              startTime={session?.startedAt}
              isLoading={sessionLoading || isRunning}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Created</dt>
                <dd className="text-[var(--color-text-primary)]">{formatDate(task.createdAt)}</dd>
              </div>

              {task.completedAt && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Completed</dt>
                  <dd className="text-[var(--color-text-primary)]">
                    {formatDate(task.completedAt)}
                  </dd>
                </div>
              )}

              {isTerminal && task.completedAt && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Duration</dt>
                  <dd className="text-[var(--color-text-primary)]">
                    {formatDuration(task.createdAt, task.completedAt)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Repository</dt>
                <dd className="text-[var(--color-text-primary)]">
                  {task.repoPath ? task.repoPath.split("/").pop() : "-"}
                </dd>
              </div>

              {task.branch && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Branch</dt>
                  <dd className="text-[var(--color-text-primary)]">{task.branch}</dd>
                </div>
              )}

              {task.failureCode && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Error</dt>
                  <dd className="text-[var(--color-destructive)]">{task.failureCode}</dd>
                </div>
              )}

              {task.executionMode && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Mode</dt>
                  <dd className="text-[var(--color-text-primary)] capitalize">
                    {task.executionMode}
                  </dd>
                </div>
              )}

              {task.pausedAt && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Paused</dt>
                  <dd className="text-[var(--color-text-primary)]">{formatDate(task.pausedAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Diff Stats */}
          {diffStats && (diffStats.added > 0 || diffStats.removed > 0) && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                <FileDiff className="h-4 w-4" />
                Changes
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[var(--color-success)] font-mono">+{diffStats.added}</span>
                <span className="text-[var(--color-destructive)] font-mono">
                  -{diffStats.removed}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  {diffStats.files.length} file
                  {diffStats.files.length !== 1 ? "s" : ""}
                </span>
              </div>
              {diffStats.files.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-[var(--color-text-muted)]">
                  {diffStats.files.slice(0, 5).map((file) => (
                    <li key={file} className="truncate font-mono">
                      {file}
                    </li>
                  ))}
                  {diffStats.files.length > 5 && (
                    <li className="text-[var(--color-text-muted)]">
                      +{diffStats.files.length - 5} more files
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Pull Request */}
          {task.status === "completed" && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">
                Pull Request
              </h2>
              {task.prUrl ? (
                <a
                  href={task.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-success)]/90"
                >
                  <GitPullRequest className="h-4 w-4" />
                  View Pull Request
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <div className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>No PR created</p>
                    <p className="mt-1 text-xs">gh CLI not configured or no changes were made</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {(isPending || canPause) && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">Actions</h2>
              <div className="space-y-2">
                {canPause && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handlePause}
                    disabled={pauseTask.isPending}
                  >
                    {pauseTask.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Pause className="mr-2 h-4 w-4" />
                    )}
                    Pause Task
                  </Button>
                )}
                {isPending && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleCancel}
                    disabled={cancelTask.isPending}
                  >
                    {cancelTask.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Cancel Task
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
