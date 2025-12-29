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
import { cn, truncate, formatDate } from "@/lib/utils";
import { getStatusStyle, getPriorityStyle } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ListTodo,
  Search,
  X,
  Trash2,
  Clock,
  FolderGit2,
  Check,
  ChevronDown,
} from "@/components/ui/icons";
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
import { Loading } from "../components";

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

interface TaskRowProps {
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

function TaskRow({ task, repoName, index, onDelete, onClick }: TaskRowProps) {
  const statusStyle = getStatusStyle(task.status);
  const priorityStyle = getPriorityStyle(task.priority ?? "medium");

  return (
    <div
      className={cn(
        "group relative cursor-pointer border-b border-border/50 transition-all duration-200",
        "hover:bg-muted/30",
        "animate-in fade-in slide-in-from-right-2",
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
      {/* Left status indicator */}
      <div className={cn("absolute left-0 top-0 h-full w-0.5", statusStyle.bgColor)} />

      <div className="flex items-center justify-between gap-2 lg:gap-3 p-2 lg:p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {truncate(task.prompt, 100)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border px-1.5 py-0 text-[10px] uppercase tracking-wider",
              priorityStyle.bgColor,
              priorityStyle.borderColor,
              priorityStyle.color,
            )}
          >
            {(task.priority ?? "medium").toLowerCase()}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border px-1.5 py-0 text-[10px] uppercase tracking-wider",
              statusStyle.bgColor,
              statusStyle.borderColor,
              statusStyle.color,
              task.status === "running" && "animate-pulse",
            )}
          >
            {task.status.toLowerCase().replace("_", " ")}
          </Badge>

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

  const handleDeleteClick = (task: {
    id: string;
    prompt: string;
    executionMode?: string | null;
  }) => {
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
    return <Loading message="Loading task queue..." />;
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
    <Container className="py-4 lg:py-6 flex-1 overflow-auto flex flex-col gap-4 lg:gap-6">
      {/* Header with technical aesthetic */}
      <div>
        <div className="flex items-center lg:items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 items-center justify-center border border-primary/30 bg-primary/10 hidden md:flex">
              <ListTodo className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Task Queue</h1>
              <p className="mt-0.5 text-xs text-muted-foreground hidden lg:block">
                Manage and monitor task execution pipeline
              </p>
            </div>
          </div>
          <NewTaskButton />
        </div>

        {/* Stats + Search/Filter row */}
        <div className="mt-4 flex flex-col lg:flex-row flex-wrap items-start lg:items-center justify-between gap-4 border-b border-border/50">
          {/* Stats - left side */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium text-foreground">{pagination.total}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Showing:</span>
              <span className="font-medium text-primary">{filteredTasks.length}</span>
            </div>
            {activeFilters.length > 0 && (
              <>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Filters:</span>
                  <span className="font-medium text-foreground">{activeFilters.length}</span>
                </div>
              </>
            )}
          </div>

          {/* Search/Filter - right side */}
          <div className="flex flex-wrap lg:justify-end flex-1 lg:ml-auto items-center gap-2">
            <div className="relative w-full min-w-[120px] max-w-full lg:max-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 bg-card pl-9 text-sm"
              />
            </div>

            {/* Repo filter */}
            <Select
              value={selectedRepoId || "__all__"}
              onValueChange={(value) => setSelectedRepoId(value === "__all__" ? "" : (value ?? ""))}
            >
              <SelectTrigger className="h-8 w-[140px] bg-card text-xs">
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
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-8 w-[140px] justify-start bg-card text-left text-xs font-normal"
                  >
                    <span>
                      {selectedStatuses.length === 0
                        ? "All statuses"
                        : selectedStatuses.length === 1
                          ? statusFilters.find((f) => f.value === selectedStatuses[0])?.label
                          : `${selectedStatuses.length} statuses`}
                    </span>
                    <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />
                  </Button>
                }
              />
              <PopoverContent className="w-[200px] p-0" align="end">
                <div className="p-1">
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className={cn(
                      "flex w-full items-center px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
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
                          className="flex w-full items-center px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
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
                className="h-8 px-2 text-xs"
                onClick={() => {
                  setSearch("");
                  setSelectedStatuses([]);
                  setSelectedRepoId("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="outline"
              className="h-6 gap-1 border-primary/30 bg-primary/5 px-2 text-xs text-primary"
            >
              {filter.label}
              <button
                onClick={filter.onRemove}
                className="ml-1 hover:bg-primary/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center border border-border bg-muted/50">
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
          <div className="mt-4 lg:mt-6 flex items-center gap-3">
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
        <div className="space-y-4 lg:space-y-6">
          {/* Today's tasks */}
          {buckets.today.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-primary">Today</h2>
                <div className="h-px flex-1 bg-primary/20" />
                <span className="text-xs text-primary">{buckets.today.length}</span>
              </div>
              <div className="overflow-hidden border border-border/50 bg-card">
                {buckets.today.map((task, index) => (
                  <TaskRow
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
            <section className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Yesterday
                </h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{buckets.yesterday.length}</span>
              </div>
              <div className="overflow-hidden border border-border/50 bg-card">
                {buckets.yesterday.map((task, index) => (
                  <TaskRow
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
            <section className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Earlier
                </h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{buckets.remaining.length}</span>
              </div>
              <div className="overflow-hidden border border-border/50 bg-card">
                {buckets.remaining.map((task, index) => (
                  <TaskRow
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
