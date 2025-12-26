/**
 * Tasks Page
 *
 * Shows list of all tasks with filtering and search.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks, useDeleteTask } from "@/hooks/useTasks";
import { useRepos } from "@/hooks/useRepos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListTodo, Search, X, Trash2 } from "@/components/ui/icons";
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

const priorityToVariant: Record<string, "low" | "medium" | "high" | "urgent"> = {
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent",
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

function truncatePrompt(prompt: string, maxLen = 60): string {
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

  const handleKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/tasks/${taskId}`);
    }
  };

  const handleDeleteClick = (
    e: React.MouseEvent,
    task: { id: string; prompt: string; executionMode?: string | null },
  ) => {
    e.stopPropagation(); // Prevent row click
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
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Container className="py-4 lg:py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <div className="hidden text-sm text-muted-foreground sm:block">
            {pagination.total} task{pagination.total !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NewTaskButton />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative w-full sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Repo filter */}
            <div className="w-full sm:w-[260px]">
              <Select
                value={selectedRepoId || "__all__"}
                onValueChange={(value) =>
                  setSelectedRepoId(value === "__all__" ? "" : (value ?? ""))
                }
              >
                <SelectTrigger className="w-full">
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
            </div>
          </div>

          {/* Clear */}
          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <div className="text-xs text-muted-foreground">
              Showing {filteredTasks.length} of {pagination.total}
            </div>
            {(search.trim() || selectedStatuses.length > 0 || selectedRepoId) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setSearch("");
                  setSelectedStatuses([]);
                  setSelectedRepoId("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Status filter */}
        <div className="mt-3 flex flex-wrap gap-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                if (filter.value === "all") {
                  setSelectedStatuses([]);
                  return;
                }
                setSelectedStatuses((prev) => {
                  const v = filter.value as TaskStatus;
                  const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
                  return next;
                });
              }}
              className={`rounded-(--radius-md) px-3 py-1.5 text-sm transition-colors ${
                filter.value === "all"
                  ? selectedStatuses.length === 0
                  : selectedStatuses.includes(filter.value as TaskStatus)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {filter.label}
                <button onClick={filter.onRemove} className="rounded hover:bg-background/50">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card">
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTodo className="h-4 w-4" />
              </EmptyMedia>
              <EmptyTitle>
                {search || selectedStatuses.length ? "No matching tasks" : "No tasks yet"}
              </EmptyTitle>
              <EmptyDescription>
                {search || selectedStatuses.length
                  ? "Try adjusting your filters, or create a new task."
                  : "Create a task for Claude to pick up next."}
              </EmptyDescription>
            </EmptyHeader>

            <EmptyContent className="gap-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <NewTaskButton />

                {(search.trim() || selectedStatuses.length) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setSelectedStatuses([]);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {!search && selectedStatuses.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Tip: you can paste a GitHub issue/PR URL into the prompt.
                </p>
              )}
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
          {(() => {
            const buckets = {
              today: [] as typeof filteredTasks,
              yesterday: [] as typeof filteredTasks,
              remaining: [] as typeof filteredTasks,
            };
            for (const t of filteredTasks) {
              buckets[bucketByDay(t.createdAt)].push(t);
            }

            const renderSectionTbody = (title: string, rows: typeof filteredTasks) => {
              if (rows.length === 0) return null;

              return (
                <TableBody className="border-b border-border">
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={6} className="py-2 pt-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{title}</div>
                        <Badge variant="outline">{rows.length}</Badge>
                      </div>
                    </TableCell>
                  </TableRow>

                  {rows.map((task) => (
                    <TableRow
                      key={task.id}
                      onClick={() => handleRowClick(task.id)}
                      onKeyDown={(e) => handleKeyDown(e, task.id)}
                      tabIndex={0}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{truncatePrompt(task.prompt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={statusToVariant[task.status] ?? "secondary"}
                          className={task.status === "running" ? "animate-pulse" : ""}
                        >
                          {task.status.toLowerCase().replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={priorityToVariant[task.priority ?? "medium"] ?? "medium"}>
                          {(task.priority ?? "medium").toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.repoId
                          ? (repoById.get(task.repoId)?.name ?? "Unknown repo")
                          : task.repoPath
                            ? task.repoPath.split("/").pop()
                            : "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(task.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteClick(e, task)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              );
            };

            return (
              <div className="rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45%]">Prompt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Repo</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>

                  {renderSectionTbody("Today", buckets.today)}
                  {renderSectionTbody("Yesterday", buckets.yesterday)}
                  {renderSectionTbody("Earlier", buckets.remaining)}
                </Table>
              </div>
            );
          })()}

          {/* Load more (keeps time-buckets meaningful) */}
          {pagination.total > limit && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min(limit, pagination.total)} of {pagination.total}
              </div>
              <Button
                variant="outline"
                onClick={() => setLimit((v) => Math.min(pagination.total, v + 80))}
              >
                Load more
              </Button>
            </div>
          )}
        </>
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
