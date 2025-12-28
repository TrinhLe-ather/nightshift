/**
 * Task Chat Page
 *
 * Unified chat-like interface for viewing and interacting with tasks.
 * Features a task list sidebar and a chat-style message view.
 */

import { useState, useCallback, useMemo, useRef, useEffect, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useTask, useContinueTask } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { cn } from "@/lib/utils";
import { getStatusStyle, statusToVariant } from "@/lib/status";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskListSidebar } from "@/components/TaskListSidebar";
import {
  TranscriptViewer,
  type FileChange,
  type SessionEvent,
} from "@/components/TranscriptViewer";
import { ChangedFilesList } from "@/components/ChangedFilesList";
import {
  AlertCircle,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Clock,
  GitBranch,
  FolderGit2,
  Activity,
  SidebarRight,
  Send,
} from "@/components/ui/icons";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODEL_OPTIONS, getModelColor } from "@/web/lib/models";

const TASKCHAT_TASKLIST_SIZE_KEY = "taskchat_tasklist_size";
const TASKCHAT_TASKLIST_MIN = 15;
const TASKCHAT_TASKLIST_MAX = 40;
const TASKCHAT_TASKLIST_DEFAULT = 25;

function getStoredTaskListSize(): number {
  if (typeof window === "undefined") return TASKCHAT_TASKLIST_DEFAULT;
  const raw = localStorage.getItem(TASKCHAT_TASKLIST_SIZE_KEY);
  const n = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return TASKCHAT_TASKLIST_DEFAULT;
  return Math.max(TASKCHAT_TASKLIST_MIN, Math.min(TASKCHAT_TASKLIST_MAX, n));
}

const EMPTY_EVENTS: SessionEvent[] = [];

export function TaskChat() {
  const { id } = useParams<{ id: string }>();
  const taskId = id ?? "";

  const { data: task, isLoading: taskLoading, error: taskError } = useTask(taskId);
  const isLive = task?.status === "claimed" || task?.status === "running";
  const isTerminal = ["completed", "failed", "canceled"].includes(task?.status ?? "");

  // Fetch session events
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions", taskId],
    queryFn: async () => {
      if (!taskId) return { sessions: [] };
      return client.sessions.list({ taskId, limit: 100 });
    },
    enabled: !!task && !isTerminal,
    refetchInterval: isLive ? 2000 : false,
  });

  const sessionId = sessionsData?.sessions[0]?.id;
  const { data: eventsData } = useQuery({
    queryKey: ["session-events", sessionId],
    queryFn: async () => {
      if (!sessionId) return { events: EMPTY_EVENTS };
      return client.sessions.get({ id: sessionId });
    },
    enabled: !!sessionId,
    refetchInterval: isLive ? 2000 : false,
  });

  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [taskListDefaultSize] = useState(getStoredTaskListSize);
  const taskListSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Continue task functionality
  const [continuePrompt, setContinuePrompt] = useState("");
  const [continueModel, setContinueModel] = useState("");
  const continueTask = useContinueTask();
  const canContinue = isTerminal && task?.sdkSessionId;

  const handleContinueSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!taskId || !continuePrompt.trim() || continueTask.isPending) return;

      continueTask.mutate(
        {
          id: taskId,
          prompt: continuePrompt.trim(),
          model: continueModel || undefined,
        },
        {
          onSuccess: () => {
            setContinuePrompt("");
            setContinueModel("");
          },
        },
      );
    },
    [taskId, continuePrompt, continueModel, continueTask],
  );

  // Avoid flashing stale changed-files UI when switching tasks.
  useEffect(() => {
    setFileChanges([]);
    setSidebarCollapsed(false);
  }, [taskId]);

  const handleFileChanges = useCallback((changes: FileChange[]) => {
    setFileChanges(changes);
  }, []);

  const handleTaskListResize = useCallback((leftSize: number) => {
    if (typeof window === "undefined") return;

    // Debounce localStorage writes while dragging.
    if (taskListSaveTimerRef.current) clearTimeout(taskListSaveTimerRef.current);
    taskListSaveTimerRef.current = setTimeout(() => {
      const size = Math.max(TASKCHAT_TASKLIST_MIN, Math.min(TASKCHAT_TASKLIST_MAX, leftSize));
      localStorage.setItem(TASKCHAT_TASKLIST_SIZE_KEY, String(Math.round(size * 100) / 100));
    }, 150);
  }, []);

  // Calculate task duration and format timestamps
  const taskDuration = useMemo(() => {
    if (!task) return null;

    const start = task.startedAt
      ? new Date(task.startedAt)
      : task.claimedAt
        ? new Date(task.claimedAt)
        : null;
    const end = task.completedAt ? new Date(task.completedAt) : new Date();

    if (!start) return null;

    const diffMs = end.getTime() - start.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffHr > 0) return `${diffHr}h ${diffMin % 60}m`;
    if (diffMin > 0) return `${diffMin}m ${diffSec % 60}s`;
    return `${diffSec}s`;
  }, [task]);

  const formattedCreatedAt = useMemo(() => {
    if (!task?.createdAt) return null;
    const date = new Date(task.createdAt);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [task]);

  return (
    <div className="h-svh overflow-hidden">
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full"
        onResize={handleTaskListResize}
      >
        {/* Task List Sidebar */}
        <ResizablePanel
          defaultSize={taskListDefaultSize}
          minSize={TASKCHAT_TASKLIST_MIN}
          maxSize={TASKCHAT_TASKLIST_MAX}
        >
          <TaskListSidebar selectedTaskId={taskId} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat View */}
        <ResizablePanel defaultSize={75} minSize={50}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Task Header - Table Row Style */}
            {task &&
              (() => {
                const statusStyle = getStatusStyle(task.status);
                return (
                  <div className="shrink-0 overflow-hidden border-b border-border/50 bg-card">
                    {/* Grid pattern background */}
                    <div className="pointer-events-none absolute inset-0 opacity-[0.015]">
                      <div
                        className="h-full w-full"
                        style={{
                          backgroundImage:
                            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                          backgroundSize: "16px 16px",
                        }}
                      />
                    </div>

                    <div className="relative">
                      {/* Left status indicator */}
                      <div
                        className={cn("absolute left-0 top-0 h-full w-1", statusStyle.bgColor)}
                      />

                      <div className="flex items-start justify-between gap-3 px-4 py-3 pl-5">
                        <div className="min-w-0 flex-1">
                          {/* Task ID as title */}
                          <div className="text-sm font-medium text-foreground">
                            Task #{task.id.slice(0, 8)}
                          </div>

                          {/* Metadata row */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {task.repoPath && (
                              <span className="flex items-center gap-1">
                                <FolderGit2 className="h-3 w-3" />
                                <span
                                  className="font-mono truncate max-w-[150px]"
                                  title={task.repoPath}
                                >
                                  {task.repoPath.split("/").pop()}
                                </span>
                              </span>
                            )}
                            {task.branch && (
                              <span className="flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                <span className="font-mono">{task.branch}</span>
                              </span>
                            )}
                            {formattedCreatedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formattedCreatedAt}
                              </span>
                            )}
                            {taskDuration && (
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                {taskDuration}
                              </span>
                            )}
                            {task.executionMode && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider"
                              >
                                {task.executionMode}
                              </Badge>
                            )}
                            {task.priority && task.priority !== "medium" && (
                              <Badge
                                variant={
                                  task.priority === "urgent" || task.priority === "high"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider"
                              >
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Right side: Status badge and actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {task.prUrl && (
                            <a
                              href={task.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90 transition-colors"
                            >
                              <GitPullRequest className="h-3.5 w-3.5" />
                              PR
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {fileChanges.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                              title={sidebarCollapsed ? "Show changed files" : "Hide changed files"}
                            >
                              <SidebarRight className="h-4 w-4" />
                            </Button>
                          )}
                          <Badge
                            variant={statusToVariant[task.status] ?? "secondary"}
                            className={cn(
                              "shrink-0 border text-[10px] uppercase tracking-wider",
                              statusStyle.bgColor,
                              statusStyle.borderColor,
                              statusStyle.color,
                              isLive && "animate-pulse",
                            )}
                          >
                            {task.status.toLowerCase().replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Loading state */}
            {taskLoading && (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {/* Error state */}
            {taskError && (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <p className="text-muted-foreground">Task not found</p>
              </div>
            )}

            {/* Chat Messages */}
            {task && !taskLoading && !taskError && (
              <div className="flex-1 flex gap-3 p-4 overflow-hidden">
                {/* Main transcript view */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <TranscriptViewer
                    key={taskId}
                    taskId={taskId}
                    events={(eventsData?.events as SessionEvent[]) ?? EMPTY_EVENTS}
                    prompt={task.prompt}
                    promptTimestamp={task.createdAt}
                    onFileChanges={handleFileChanges}
                    autoScroll={true}
                    className="h-full min-h-0"
                  />
                </div>

                {/* Changed files sidebar - scrollable container */}
                {fileChanges.length > 0 && !sidebarCollapsed && (
                  <div className="min-w-80 shrink-0 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto">
                      <ChangedFilesList changes={fileChanges} variant="card" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Continue Task Input */}
            {canContinue && (
              <div className="shrink-0 border-t border-border/50 bg-card p-4">
                <form onSubmit={handleContinueSubmit} className="flex flex-col gap-2">
                  <Textarea
                    value={continuePrompt}
                    onChange={(e) => setContinuePrompt(e.target.value)}
                    placeholder="Continue this task with a follow-up prompt..."
                    className="min-h-[60px] max-h-[200px] resize-none w-full"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleContinueSubmit(e);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={continueModel}
                        onValueChange={(v) => setContinueModel(v ?? "")}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue>
                            {continueModel ? (
                              <span className={getModelColor(continueModel)}>
                                {MODEL_OPTIONS.find((m) => m.value === continueModel)?.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Default model</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value || "_default"} value={option.value}>
                              <span className={option.color}>{option.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">
                        <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘</kbd>+
                        <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to
                        send
                      </span>
                    </div>
                    <Button
                      type="submit"
                      disabled={!continuePrompt.trim() || continueTask.isPending}
                    >
                      {continueTask.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="ml-2">Continue</span>
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
