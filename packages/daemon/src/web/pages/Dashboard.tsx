/**
 * Dashboard Page
 *
 * Shows daemon status and task summary cards.
 */

import { useStatus } from "@/web/hooks";
import { useTasks } from "@/hooks/useTasks";
import { truncate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderGit2,
  ListTodo,
  Pause,
  XCircle,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/badge";
import { NewTaskButton } from "@/components";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconClassName: string;
  iconBgClassName: string;
}

const statusToVariant: Record<
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function StatCard({ label, value, icon: Icon, iconClassName, iconBgClassName }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div
          className={cn("flex h-10 w-10 items-center justify-center rounded-md", iconBgClassName)}
        >
          <Icon className={cn("h-5 w-5", iconClassName)} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data: status, isLoading, error } = useStatus();
  const { data: recentTasksData, isLoading: recentTasksLoading } = useTasks({
    limit: 6,
    offset: 0,
  });
  const recentTasks = recentTasksData?.tasks ?? [];

  // Determine if daemon is actually running based on API connectivity
  const isDaemonRunning = !error && status?.running === true;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const hasTasks = status
    ? status.stats.pending +
        status.stats.running +
        status.stats.paused +
        status.stats.completed +
        status.stats.failed >
      0
    : false;

  return (
    <Container className="py-4 lg:py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        {isDaemonRunning && <NewTaskButton />}
      </div>

      {/* Status Section */}
      <div className="mb-6 text-card-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                isDaemonRunning ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
            <span className="text-lg font-medium">
              {isDaemonRunning ? "Daemon Running" : "Daemon Stopped"}
            </span>
          </div>
          {isDaemonRunning && status && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>v{status.version}</span>
              <span className="rounded bg-muted px-2 py-0.5 capitalize">{status.mode}</span>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDaemonRunning && status
            ? `Night Shift is ready to execute tasks on port ${status.port}`
            : "Daemon is not responding. Start with 'nightshift start' to begin executing tasks."}
        </p>
      </div>

      {/* Stats Grid */}
      {isDaemonRunning && status ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label="Pending"
              value={status.stats.pending}
              icon={Clock}
              iconClassName="text-blue-500"
              iconBgClassName="bg-blue-500/10"
            />
            <StatCard
              label="In Progress"
              value={status.stats.running}
              icon={Activity}
              iconClassName="text-primary"
              iconBgClassName="bg-primary/10"
            />
            <StatCard
              label="Paused"
              value={status.stats.paused}
              icon={Pause}
              iconClassName="text-amber-500"
              iconBgClassName="bg-amber-500/10"
            />
            <StatCard
              label="Completed"
              value={status.stats.completed}
              icon={CheckCircle2}
              iconClassName="text-emerald-500"
              iconBgClassName="bg-emerald-500/10"
            />
            <StatCard
              label="Failed"
              value={status.stats.failed}
              icon={XCircle}
              iconClassName="text-destructive"
              iconBgClassName="bg-destructive/10"
            />
          </div>

          {/* Repos Count */}
          <div className="mb-6">
            <StatCard
              label="Configured Repositories"
              value={status.stats.repoCount}
              icon={FolderGit2}
              iconClassName="text-muted-foreground"
              iconBgClassName="bg-muted"
            />
          </div>
        </>
      ) : (
        <div className="mb-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <p className="text-lg font-medium text-foreground">Daemon Not Running</p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            The Night Shift daemon is not responding.
            <br />
            Start it from your terminal with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              nightshift start
            </code>
          </p>
        </div>
      )}

      {/* Empty State */}
      {isDaemonRunning && !hasTasks && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg text-foreground">No tasks yet</p>
          <p className="mt-2 mb-4 text-sm text-muted-foreground">
            Create your first task to get started
          </p>
          <NewTaskButton />
        </div>
      )}

      {/* Recent Tasks */}
      {isDaemonRunning && hasTasks && (
        <div className="rounded-lg border border-border bg-card text-card-foreground">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Recent tasks</h2>
            </div>
            <Link to="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>

          {recentTasksLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : recentTasks.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">No recent tasks.</div>
          ) : (
            <div className="divide-y divide-border">
              {recentTasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {truncate(task.prompt, 100)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FolderGit2 className="h-3.5 w-3.5" />
                          {task.repoPath ? task.repoPath.split("/").pop() : "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(task.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={statusToVariant[task.status] ?? "secondary"}
                        className={task.status === "running" ? "animate-pulse" : ""}
                      >
                        {task.status.toLowerCase().replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Container>
  );
}
