/**
 * Dashboard Page
 *
 * Shows daemon status and task summary with technical command center aesthetic.
 * Features real-time status indicators, animated stats, and visual task timeline.
 *
 * Design: Mission control / technical command center with precision engineering vibes.
 */

import { useState } from "react";
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
  Plus,
  XCircle,
  LayoutDashboard,
  Folder,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/badge";
import { AddRepoDialog, NewTaskButton } from "@/components";
import { Button } from "@/components/ui/button";

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

// Status color mapping
function getStatusStyle(status: string): {
  color: string;
  bgColor: string;
  borderColor: string;
} {
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
    default:
      return {
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
      };
  }
}

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

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  index: number;
}

function StatCard({ label, value, icon: Icon, color, bgColor, borderColor, index }: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
        borderColor,
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      {/* Left indicator strip */}
      <div className={cn("absolute left-0 top-0 h-full w-1", bgColor)} />

      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{value}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg border",
            bgColor,
            borderColor,
          )}
        >
          <Icon className={cn("h-5 w-5", color)} />
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  index,
}: {
  task: {
    id: string;
    prompt: string;
    status: string;
    repoPath: string | null;
    createdAt: string;
  };
  index: number;
}) {
  const statusStyle = getStatusStyle(task.status);

  return (
    <Link
      to={`/tasks/${task.id}`}
      className={cn(
        "group relative block overflow-hidden border-b border-border/50 transition-all duration-200",
        "hover:bg-muted/30",
        "animate-in fade-in slide-in-from-right-2",
      )}
      style={{ animationDelay: `${index * 30}ms`, animationFillMode: "both" }}
    >
      {/* Left status indicator */}
      <div className={cn("absolute left-0 top-0 h-full w-0.5", statusStyle.bgColor)} />

      <div className="flex items-start justify-between gap-3 px-4 py-3 pl-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {truncate(task.prompt, 80)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" />
              {task.repoPath ? task.repoPath.split("/").pop() : "—"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(task.createdAt)}
            </span>
          </div>
        </div>

        <Badge
          variant={statusToVariant[task.status] ?? "secondary"}
          className={cn(
            "shrink-0 rounded border text-[10px] uppercase tracking-wider",
            statusStyle.bgColor,
            statusStyle.borderColor,
            statusStyle.color,
            task.status === "running" && "animate-pulse",
          )}
        >
          {task.status.toLowerCase().replace("_", " ")}
        </Badge>
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { data: status, isLoading, error } = useStatus();
  const { data: recentTasksData, isLoading: recentTasksLoading } = useTasks({
    limit: 6,
    offset: 0,
  });
  const recentTasks = recentTasksData?.tasks ?? [];
  const [addRepoOpen, setAddRepoOpen] = useState(false);

  // Determine if daemon is actually running based on API connectivity
  const isDaemonRunning = !error && status?.running === true;

  if (isLoading) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Initializing command center...</p>
        </div>
      </Container>
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
    <Container className="py-6 lg:py-8">
      {/* Header with technical aesthetic */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <LayoutDashboard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Command Center
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Night Shift task orchestration dashboard
                </p>
              </div>
            </div>
          </div>
          {isDaemonRunning && <NewTaskButton />}
        </div>

        {/* Daemon Status Bar */}
        <div className="mt-6 flex items-center gap-6 border-y border-border/50 py-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                isDaemonRunning
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
              )}
            />
            <span className="text-xs font-medium text-foreground">
              {isDaemonRunning ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          {isDaemonRunning && status && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-medium font-mono text-foreground">v{status.version}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Port:</span>
                <span className="font-medium font-mono text-foreground">{status.port}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Mode:</span>
                <Badge
                  variant="outline"
                  className="h-5 rounded border-primary/30 bg-primary/5 px-1.5 text-[10px] uppercase tracking-wider text-primary"
                >
                  {status.mode}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {isDaemonRunning && status ? (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label="Pending"
              value={status.stats.pending}
              icon={Clock}
              color="text-sky-400"
              bgColor="bg-sky-500/10"
              borderColor="border-sky-500/30"
              index={0}
            />
            <StatCard
              label="In Progress"
              value={status.stats.running}
              icon={Activity}
              color="text-primary"
              bgColor="bg-primary/10"
              borderColor="border-primary/30"
              index={1}
            />
            <StatCard
              label="Paused"
              value={status.stats.paused}
              icon={Pause}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
              borderColor="border-amber-500/30"
              index={2}
            />
            <StatCard
              label="Completed"
              value={status.stats.completed}
              icon={CheckCircle2}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
              borderColor="border-emerald-500/30"
              index={3}
            />
            <StatCard
              label="Failed"
              value={status.stats.failed}
              icon={XCircle}
              color="text-rose-400"
              bgColor="bg-rose-500/10"
              borderColor="border-rose-500/30"
              index={4}
            />
          </div>

          {/* Repos Count */}
          {status.stats.repoCount === 0 ? (
            <div className="mb-8 overflow-hidden rounded-lg border border-dashed border-border bg-card/50">
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
                  <FolderGit2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No repositories configured
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a repository to enable task execution
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <Button onClick={() => setAddRepoOpen(true)} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Repository
                  </Button>
                  <Link
                    to="/repos"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Manage repos
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <StatCard
                label="Repositories"
                value={status.stats.repoCount}
                icon={FolderGit2}
                color="text-violet-400"
                bgColor="bg-violet-500/10"
                borderColor="border-violet-500/30"
                index={5}
              />
            </div>
          )}
        </>
      ) : (
        <div className="mb-8 overflow-hidden rounded-lg border border-rose-500/30 bg-rose-500/5">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <AlertCircle className="h-8 w-8 text-rose-400" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Daemon Not Running</p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Start the Night Shift daemon to begin executing tasks
            </p>
            <code className="mt-4 rounded-lg border border-border bg-muted/50 px-4 py-2 font-mono text-xs text-foreground">
              nightshift start
            </code>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isDaemonRunning && !hasTasks && (
        <div className="overflow-hidden rounded-lg border border-dashed border-border bg-card/50">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
              <ListTodo className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No tasks yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first task for Claude to execute
            </p>
            <div className="mt-6">
              <NewTaskButton />
            </div>
          </div>
        </div>
      )}

      {/* Recent Tasks */}
      {isDaemonRunning && hasTasks && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Recent Tasks
            </h2>
            <div className="h-px flex-1 bg-border/50" />
            <Link
              to="/tasks"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/50 bg-card">
            {recentTasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="relative">
                  <div className="h-8 w-8 rounded-full border-2 border-border" />
                  <div className="absolute inset-0 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No recent tasks
              </div>
            ) : (
              <div className="relative">
                {recentTasks.map((task, index) => (
                  <TaskRow key={task.id} task={task} index={index} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <AddRepoDialog open={addRepoOpen} onOpenChange={setAddRepoOpen} />
    </Container>
  );
}
