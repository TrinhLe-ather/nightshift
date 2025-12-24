/**
 * Dashboard Page
 *
 * Shows daemon status, active task, and task summary cards.
 */

import { useStatus } from "@/web/hooks";
import { formatDuration, truncate } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderGit2,
  Pause,
  XCircle,
} from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data: status, isLoading, error } = useStatus();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[var(--color-destructive)]">Failed to load status</div>
      </div>
    );
  }

  if (!status) return null;

  const hasActiveTask = status.activeTask !== null;
  const hasTasks =
    status.stats.pending +
      status.stats.running +
      status.stats.paused +
      status.stats.completed +
      status.stats.failed >
    0;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--color-text-primary)]">Dashboard</h1>

      {/* Status Section */}
      <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                status.running ? "bg-[var(--color-success)]" : "bg-[var(--color-destructive)]"
              }`}
            />
            <span className="text-lg font-medium">
              {status.running ? "Daemon Running" : "Daemon Stopped"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
            <span>v{status.version}</span>
            <span className="rounded bg-[var(--color-surface-hover)] px-2 py-0.5 capitalize">
              {status.mode}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {status.running
            ? `Night Shift is ready to execute tasks on port ${status.port}`
            : "Start the daemon to begin executing tasks"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Pending"
          value={status.stats.pending}
          icon={Clock}
          color="var(--color-info)"
        />
        <StatCard
          label="In Progress"
          value={status.stats.running}
          icon={Activity}
          color="var(--color-accent)"
        />
        <StatCard
          label="Paused"
          value={status.stats.paused}
          icon={Pause}
          color="var(--color-warning)"
        />
        <StatCard
          label="Completed"
          value={status.stats.completed}
          icon={CheckCircle2}
          color="var(--color-success)"
        />
        <StatCard
          label="Failed"
          value={status.stats.failed}
          icon={XCircle}
          color="var(--color-destructive)"
        />
      </div>

      {/* Repos Count */}
      <div className="mb-6">
        <StatCard
          label="Configured Repositories"
          value={status.stats.repoCount}
          icon={FolderGit2}
          color="var(--color-text-secondary)"
        />
      </div>

      {/* Active Task Section */}
      {hasActiveTask && status.activeTask && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--color-accent)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse-orange rounded-full bg-[var(--color-accent)]" />
            <span className="text-lg font-medium text-[var(--color-accent)]">
              Currently Working On
            </span>
          </div>
          <div className="mt-4">
            <p className="text-[var(--color-text-primary)]">
              {truncate(status.activeTask.prompt, 200)}
            </p>
            <div className="mt-3 flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
              {status.activeTask.repoPath && (
                <span className="flex items-center gap-1">
                  <FolderGit2 className="h-4 w-4" />
                  {status.activeTask.repoPath.split("/").pop()}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(status.activeTask.elapsedMs)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasTasks && (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <AlertCircle className="mb-4 h-12 w-12 text-[var(--color-text-muted)]" />
          <p className="text-lg text-[var(--color-text-secondary)]">No tasks yet</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Press{" "}
            <kbd className="rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[var(--color-accent)]">
              Cmd+K
            </kbd>{" "}
            to create your first task
          </p>
        </div>
      )}
    </div>
  );
}
