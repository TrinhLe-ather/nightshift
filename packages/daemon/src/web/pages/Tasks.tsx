/**
 * Tasks Page
 *
 * Task queue management with technical blueprint aesthetic.
 * Features visual task cards, status filtering, and time-bucketed organization.
 *
 * Design: Technical blueprint with precision engineering vibes and visual hierarchy.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks, useDeleteTask } from "@/hooks/useTasks";
import { useRepos } from "@/hooks/useRepos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ListTodo, Search, X, Trash2, Clock, FolderGit2, Check, ChevronDown } from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { NewTaskButton } from "@/components/NewTaskButton";
import { DeleteTaskDialog } from "@/components/DeleteTaskDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

type TaskStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "needs_human"
  | "paused"
  | "canceled";

const statusFilters: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "needs_human", label: "Needs Input" },
  { value: "canceled", label: "Canceled" },
];

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

// Priority color mapping
function getPriorityStyle(priority: string): {
  color: string;
  bgColor: string;
  borderColor: string;
} {
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

function truncatePrompt(prompt: string, maxLen = 80): string {
  if (prompt.length <= maxLen) return prompt;
  return prompt.substring(0, maxLen) + "...";
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucketByDay(createdAt: string) {
  const created = new Date(createdAt);
  const todayStart = startOfLocalDay(new Date());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  if (created >= todayStart) return "today" as const;
  if (created >= yesterdayStart) return "yesterday" as const;
  return "remaining" as const;
}

interface TaskCardProps {
  task: {
    id: string;
    prompt: string;
    status: string;
    priority?: string | null;
    repoId: string | null;
    repoPath: string | null;
    createdAt: string;
    executionMode?: string | null;
  };
  repoName?: string;
  index: number;
  onDelete: () => void;
  onClick: () => void;
}

function TaskCard({ task, repoName, index, onDelete, onClick }: TaskCardProps) {
  const statusStyle = getStatusStyle(task.status);
  const priorityStyle = getPriorityStyle(task.priority ?? "medium");

  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
        statusStyle.borderColor,
      )}
      style={{ animationDelay: `${index * 30}ms`, animationFillMode: "both" }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
    >
      {/* Grid pattern background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Left status indicator strip */}
      <div className={cn("absolute left-0 top-0 h-full w-1", statusStyle.bgColor)} />

      {/* Content */}
      <div className="relative p-4 pl-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
              {truncatePrompt(task.prompt)}
            </p>
          </div>

          {/* Delete button - visible on hover */}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-7 w-7 shrink-0 p-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded border px-1.5 py-0 text-[10px] uppercase tracking-wider",
              statusStyle.bgColor,
              statusStyle.borderColor,
              statusStyle.color,
              task.status === "running" && "animate-pulse",
            )}
          >
            {task.status.toLowerCase().replace("_", " ")}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "rounded border px-1.5 py-0 text-[10px] uppercase tracking-wider",
              priorityStyle.bgColor,
              priorityStyle.borderColor,
              priorityStyle.color,
            )}
          >
            {(task.priority ?? "medium").toLowerCase()}
          </Badge>
        </div>

        {/* Footer row */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FolderGit2 className="h-3 w-3" />
            {repoName || (task.repoPath ? task.repoPath.split("/").pop() : "—")}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(task.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Tasks() {
  const navigate = useNavigate();
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [limit, setLimit] = useState(80);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    prompt: string;
    executionMode?: string | null;
  } | null>(null);

  const deleteTask = useDeleteTask();
  const { data: repos = [] } = useRepos();

  const { data, isLoading } = useTasks({
    status: selectedStatuses.length ? selectedStatuses.join(",") : undefined,
    repoId: selectedRepoId || undefined,
    limit,
    offset: 0,
  });

  const pagination = data?.pagination ?? { total: 0, limit, offset: 0 };

  const repoById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; path: string }>();
    for (const r of repos) map.set(r.id, r);
    return map;
  }, [repos]);

  const selectedRepo = selectedRepoId ? repoById.get(selectedRepoId) : undefined;

  // Client-side search filter
  const filteredTasks = useMemo(() => {
    const allTasks = data?.tasks ?? [];
    if (!search.trim()) return allTasks;
    const searchLower = search.toLowerCase();
    return allTasks.filter((task) => task.prompt.toLowerCase().includes(searchLower));
  }, [search, data]);

  // Active filter chips
  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [];
  if (selectedStatuses.length) {
    for (const s of selectedStatuses) {
      activeFilters.push({
        key: `status:${s}`,
        label: `Status: ${statusFilters.find((f) => f.value === s)?.label ?? s}`,
        onRemove: () => setSelectedStatuses((prev) => prev.filter((x) => x !== s)),
      });
    }
  }
  if (selectedRepoId) {
    activeFilters.push({
      key: "repo",
      label: `Repo: ${selectedRepo?.name ?? "Unknown repo"}`,
      onRemove: () => setSelectedRepoId(""),
    });
  }
  if (search.trim()) {
    activeFilters.push({
      key: "search",
      label: `Search: "${search}"`,
      onRemove: () => setSearch(""),
    });
  }

  const handleRowClick = (taskId: string) => {
    navigate(`/tasks/${taskId}`);
  };

  const handleDeleteClick = (task: { id: string; prompt: string; executionMode?: string | null }) => {
    setDeleteConfirm(task);
  };

  const confirmDelete = async (deleteBranch: boolean) => {
    if (!deleteConfirm) return;

    try {
      await deleteTask.mutateAsync({ id: deleteConfirm.id, deleteBranch });
      toast.success("Task deleted");
      setDeleteConfirm(null);
    } catch (error) {
      toast.error("Failed to delete task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  if (isLoading) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading task queue...</p>
        </div>
      </Container>
    );
  }

  // Bucket tasks by day
  const buckets = {
    today: [] as typeof filteredTasks,
    yesterday: [] as typeof filteredTasks,
    remaining: [] as typeof filteredTasks,
  };
  for (const t of filteredTasks) {
    buckets[bucketByDay(t.createdAt)].push(t);
  }

  return (
    <Container className="py-6 lg:py-8">
      {/* Header with technical aesthetic */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <ListTodo className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Task Queue</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Manage and monitor task execution pipeline
                </p>
              </div>
            </div>
          </div>
          <NewTaskButton />
        </div>

        {/* Stats bar */}
        <div className="mt-6 flex items-center gap-6 border-y border-border/50 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium text-foreground">{pagination.total}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Showing:</span>
            <span className="font-medium text-primary">{filteredTasks.length}</span>
          </div>
          {activeFilters.length > 0 && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Filters:</span>
                <span className="font-medium text-foreground">{activeFilters.length}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-card pl-10 text-sm"
          />
        </div>

        {/* Repo filter */}
        <Select
          value={selectedRepoId || "__all__"}
          onValueChange={(value) => setSelectedRepoId(value === "__all__" ? "" : (value ?? ""))}
        >
          <SelectTrigger className="h-9 w-full bg-card sm:w-[180px]">
            <SelectValue>
              {selectedRepoId ? repoById.get(selectedRepoId)?.name : "All repos"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All repos</SelectItem>
            {repos.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Popover>
          <PopoverTrigger>
            <Button
              variant="outline"
              className="h-9 w-full justify-start bg-card text-left font-normal sm:w-[180px]"
            >
              <span className="text-sm">
                {selectedStatuses.length === 0
                  ? "All statuses"
                  : selectedStatuses.length === 1
                    ? statusFilters.find((f) => f.value === selectedStatuses[0])?.label
                    : `${selectedStatuses.length} statuses`}
              </span>
              <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <div className="p-1">
              <button
                onClick={() => setSelectedStatuses([])}
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  selectedStatuses.length === 0 && "bg-accent",
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedStatuses.length === 0 ? "opacity-100" : "opacity-0",
                  )}
                />
                All statuses
              </button>
              <div className="my-1 h-px bg-border" />
              {statusFilters
                .filter((f) => f.value !== "all")
                .map((filter) => {
                  const isSelected = selectedStatuses.includes(filter.value as TaskStatus);
                  const style = getStatusStyle(filter.value);
                  return (
                    <button
                      key={filter.value}
                      onClick={() => {
                        setSelectedStatuses((prev) => {
                          const v = filter.value as TaskStatus;
                          return prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
                        });
                      }}
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <span className={cn(isSelected && style.color)}>{filter.label}</span>
                    </button>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear filters */}
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setSearch("");
              setSelectedStatuses([]);
              setSelectedRepoId("");
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="outline"
              className="h-6 gap-1 rounded border-primary/30 bg-primary/5 px-2 text-xs text-primary"
            >
              {filter.label}
              <button
                onClick={filter.onRemove}
                className="ml-1 rounded hover:bg-primary/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {search || selectedStatuses.length ? "No matching tasks" : "No tasks yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || selectedStatuses.length
              ? "Try adjusting your filters or create a new task"
              : "Create a task for Claude to pick up next"}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <NewTaskButton />
            {activeFilters.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedStatuses([]);
                  setSelectedRepoId("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Today's tasks */}
          {buckets.today.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-primary">Today</h2>
                <div className="h-px flex-1 bg-primary/20" />
                <span className="text-xs text-primary">{buckets.today.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {buckets.today.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    repoName={task.repoId ? repoById.get(task.repoId)?.name : undefined}
                    index={index}
                    onClick={() => handleRowClick(task.id)}
                    onDelete={() => handleDeleteClick(task)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Yesterday's tasks */}
          {buckets.yesterday.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Yesterday
                </h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{buckets.yesterday.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {buckets.yesterday.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    repoName={task.repoId ? repoById.get(task.repoId)?.name : undefined}
                    index={index}
                    onClick={() => handleRowClick(task.id)}
                    onDelete={() => handleDeleteClick(task)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Earlier tasks */}
          {buckets.remaining.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Earlier
                </h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{buckets.remaining.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {buckets.remaining.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    repoName={task.repoId ? repoById.get(task.repoId)?.name : undefined}
                    index={index}
                    onClick={() => handleRowClick(task.id)}
                    onDelete={() => handleDeleteClick(task)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Load more */}
          {pagination.total > limit && (
            <div className="flex flex-col items-center gap-3 pt-4">
              <div className="text-xs text-muted-foreground">
                Showing {Math.min(limit, pagination.total)} of {pagination.total} tasks
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((v) => Math.min(pagination.total, v + 80))}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        task={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        isDeleting={deleteTask.isPending}
      />
    </Container>
  );
}
