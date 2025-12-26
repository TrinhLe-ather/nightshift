/**
 * Task List Sidebar Component
 *
 * Displays a compact list of tasks for quick navigation.
 * Shows status dot, truncated prompt, and relative time.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks, useDeleteTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Trash2 } from "@/components/ui/icons";
import { NewTaskButton, DeleteTaskDialog } from "@/components";
import { toast } from "sonner";

type TaskStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "needs_human"
  | "paused"
  | "canceled";

interface TaskListSidebarProps {
  selectedTaskId?: string;
  className?: string;
}

const statusFilters = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "needs_human", label: "Needs Input" },
] as const;

type FilterValue = (typeof statusFilters)[number]["value"];

const statusColors: Record<TaskStatus, string> = {
  pending: "bg-muted-foreground/60",
  claimed: "bg-primary",
  running: "bg-primary",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  needs_human: "bg-amber-500",
  paused: "bg-amber-500",
  canceled: "bg-muted-foreground/60",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncatePrompt(prompt: string, maxLen = 50): string {
  // Get first line only
  const firstLine = prompt.split("\n")[0] ?? "";
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.substring(0, maxLen) + "...";
}

export function TaskListSidebar({ selectedTaskId, className }: TaskListSidebarProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    prompt: string;
    executionMode?: string | null;
  } | null>(null);

  const deleteTask = useDeleteTask();

  const { data, isLoading } = useTasks({
    status: filter === "all" ? undefined : filter,
    limit: 50,
  });

  const tasks = data?.tasks ?? [];

  // Client-side search filter
  const filteredTasks = search.trim()
    ? tasks.filter((task) => task.prompt.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  const handleTaskClick = (taskId: string) => {
    navigate(`/tasks/${taskId}`);
  };

  const handleDeleteClick = (
    e: React.MouseEvent,
    task: { id: string; prompt: string; executionMode?: string | null },
  ) => {
    e.stopPropagation();
    setDeleteConfirm(task);
  };

  const confirmDelete = async (deleteBranch: boolean) => {
    if (!deleteConfirm) return;

    try {
      await deleteTask.mutateAsync({ id: deleteConfirm.id, deleteBranch });
      toast.success("Task deleted");

      // If we just deleted the currently selected task, navigate to tasks list
      if (deleteConfirm.id === selectedTaskId) {
        navigate("/tasks");
      }

      setDeleteConfirm(null);
    } catch (error) {
      toast.error("Failed to delete task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className={cn("flex h-full flex-col bg-card text-card-foreground", className)}>
      {/* Header */}
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Tasks</h2>
          <NewTaskButton size="sm" showKbd={false} />
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 rounded-md pl-8 pr-3 text-sm"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-md transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <p className="text-sm text-muted-foreground">
              {search || filter !== "all" ? "No matching tasks" : "No tasks yet"}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {filteredTasks.map((task) => {
              const isSelected = task.id === selectedTaskId;
              const isRunning = task.status === "running" || task.status === "claimed";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "group relative w-full text-left transition-colors border-l-2",
                    isSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-muted",
                  )}
                >
                  <button
                    onClick={() => handleTaskClick(task.id)}
                    className="w-full px-3 py-2.5 pr-10"
                  >
                    <div className="flex items-start gap-2">
                      {/* Status dot */}
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 rounded-full shrink-0",
                          statusColors[task.status as TaskStatus] || statusColors.pending,
                          isRunning && "animate-pulse",
                        )}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm truncate text-left",
                            isSelected ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        >
                          {truncatePrompt(task.prompt)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(task.createdAt)}
                          </span>
                          {task.repoPath && (
                            <span className="text-xs text-muted-foreground truncate">
                              {task.repoPath.split("/").pop()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Delete button - shows on hover */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteClick(e, task)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        task={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        isDeleting={deleteTask.isPending}
      />
    </div>
  );
}
