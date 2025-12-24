/**
 * Tasks Page
 *
 * Shows list of all tasks with filtering and search.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

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

export function Tasks() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useTasks({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit,
    offset: page * limit,
  });

  const tasks = data?.tasks ?? [];
  const pagination = data?.pagination ?? { total: 0, limit, offset: 0 };

  // Client-side search filter
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const searchLower = search.toLowerCase();
    return tasks.filter((task) => task.prompt.toLowerCase().includes(searchLower));
  }, [search, tasks]);

  const totalPages = Math.ceil(pagination.total / limit);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // Active filter chips
  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [];
  if (statusFilter !== "all") {
    activeFilters.push({
      key: "status",
      label: statusFilters.find((f) => f.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => setStatusFilter("all"),
    });
  }
  if (search.trim()) {
    activeFilters.push({
      key: "search",
      label: `"${search}"`,
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Tasks</h1>
        <div className="text-sm text-[var(--color-text-muted)]">
          {pagination.total} task{pagination.total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setStatusFilter(filter.value);
                setPage(0);
              }}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm transition-colors ${
                statusFilter === filter.value
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)]"
            >
              {filter.label}
              <button
                onClick={filter.onRemove}
                className="rounded hover:bg-[var(--color-surface-hover)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <p className="text-lg text-[var(--color-text-secondary)]">
            {search || statusFilter !== "all" ? "No matching tasks" : "No tasks yet"}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Press{" "}
            <kbd className="rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[var(--color-accent)]">
              Cmd+K
            </kbd>{" "}
            to create a task
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Prompt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Repo</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
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
                    <TableCell className="text-[var(--color-text-muted)]">
                      {task.repoPath ? task.repoPath.split("/").pop() : "-"}
                    </TableCell>
                    <TableCell className="text-right text-[var(--color-text-muted)]">
                      {formatDate(task.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-muted)]">
                Showing {page * limit + 1}-{Math.min((page + 1) * limit, pagination.total)} of{" "}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={!hasPrevPage}
                  className="flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasNextPage}
                  className="flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
