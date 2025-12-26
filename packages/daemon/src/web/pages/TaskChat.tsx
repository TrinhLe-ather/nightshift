/**
 * Task Chat Page
 *
 * Unified chat-like interface for viewing and interacting with tasks.
 * Features a task list sidebar and a chat-style message view.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTask } from "@/hooks/useTasks";
import { useSendMessage } from "@/hooks/useConversations";
import { useTerminalPreview } from "@/hooks/useTerminalPreview";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { toast } from "sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskListSidebar } from "@/components/TaskListSidebar";
import {
  TranscriptViewer,
  type SdkMessage,
  type FileChange,
  type SessionEvent,
} from "@/components/TranscriptViewer";
import { ChangedFilesList } from "@/components/ChangedFilesList";
import {
  AlertCircle,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Send,
  Clock,
  GitBranch,
  FolderGit2,
  MessageSquare,
  Activity,
  SidebarRight,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

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

const EMPTY_MESSAGES: SdkMessage[] = [];
const EMPTY_EVENTS: SessionEvent[] = [];

export function TaskChat() {
  const { id } = useParams<{ id: string }>();
  const taskId = id ?? "";

  const { data: task, isLoading: taskLoading, error: taskError } = useTask(taskId);
  const isLive = task?.status === "claimed" || task?.status === "running";
  const isPaused = task?.status === "paused";
  const isNeedsHuman = task?.status === "needs_human";
  const isTerminal = ["completed", "failed", "canceled"].includes(task?.status ?? "");

  // Fetch terminal preview for transcript messages
  const { data: terminalData } = useTerminalPreview(taskId, {
    enabled: !!task && !isTerminal,
  });

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

  const sendMessage = useSendMessage();
  const [inputValue, setInputValue] = useState("");
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [taskListDefaultSize] = useState(getStoredTaskListSize);
  const taskListSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleSendMessage = async () => {
    if (!task || !inputValue.trim()) return;

    try {
      await sendMessage.mutateAsync({
        taskId: task.id,
        message: inputValue.trim(),
      });
      setInputValue("");
      toast.success("Message sent", {
        description: "Claude is processing your message...",
      });
    } catch (err) {
      toast.error("Failed to send message", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Workflow tasks don't support interactive messaging
  const isWorkflow = task?.type === "workflow";

  // Determine if we should show the input (always visible per plan, but styled differently)
  const canSendMessage = !isWorkflow && (isPaused || isNeedsHuman);
  const inputPlaceholder = canSendMessage
    ? "Type your response..."
    : isLive
      ? "Task is running..."
      : isTerminal
        ? "Task has ended"
        : "Waiting for task to start...";

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
            {/* Task Header */}
            {task && (
              <div className="shrink-0 border-b border-border bg-card text-card-foreground">
                {/* Title and Actions Row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <h1 className="text-base font-medium text-foreground">
                      Task #{task.id.slice(0, 8)}
                    </h1>
                    <Badge
                      variant={statusToVariant[task.status] ?? "secondary"}
                      className={isLive ? "animate-pulse" : ""}
                    >
                      {task.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.prUrl && (
                      <a
                        href={task.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90"
                      >
                        <GitPullRequest className="h-4 w-4" />
                        View PR
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {fileChanges.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? "Show changed files" : "Hide changed files"}
                      >
                        <SidebarRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Task Info Panel */}
                <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  {task.repoPath && (
                    <div className="flex items-center gap-1.5">
                      <FolderGit2 className="h-3.5 w-3.5" />
                      <span className="font-mono truncate max-w-[200px]" title={task.repoPath}>
                        {task.repoPath.split("/").pop()}
                      </span>
                    </div>
                  )}
                  {task.branch && (
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span className="font-mono">{task.branch}</span>
                    </div>
                  )}
                  {formattedCreatedAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Created {formattedCreatedAt}</span>
                    </div>
                  )}
                  {taskDuration && (
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      <span>{taskDuration}</span>
                    </div>
                  )}
                  {terminalData?.messages && terminalData.messages.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{terminalData.messages.length} messages</span>
                    </div>
                  )}
                  {task.executionMode && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-xs px-2 py-0 h-5">
                        {task.executionMode}
                      </Badge>
                    </div>
                  )}
                  {task.priority && task.priority !== "medium" && (
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          task.priority === "urgent" || task.priority === "high"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs px-2 py-0 h-5"
                      >
                        {task.priority}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                <div className="flex-1 min-w-0 overflow-auto">
                  <TranscriptViewer
                    messages={(terminalData?.messages as SdkMessage[]) ?? EMPTY_MESSAGES}
                    events={(eventsData?.events as SessionEvent[]) ?? EMPTY_EVENTS}
                    prompt={task.prompt}
                    isLive={terminalData?.isLive ?? false}
                    onFileChanges={handleFileChanges}
                    autoScroll={true}
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

            {/* Input Area - Only show for interactive tasks */}
            {task && !isWorkflow && (
              <div className="shrink-0 px-4 py-3 border-t border-border bg-card text-card-foreground">
                {/* Needs human notice */}
                {isNeedsHuman && task.humanQuestion && (
                  <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm text-amber-500 font-medium mb-1">
                      Claude needs your input
                    </p>
                    <p className="text-sm text-muted-foreground">{task.humanQuestion}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={inputPlaceholder}
                    disabled={!canSendMessage}
                    rows={1}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border resize-none",
                      "bg-background text-foreground",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-ring",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      canSendMessage ? "border-primary" : "border-border",
                    )}
                    style={{
                      minHeight: "40px",
                      maxHeight: "120px",
                    }}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!canSendMessage || !inputValue.trim() || sendMessage.isPending}
                    className="px-4"
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {canSendMessage
                    ? "Press Enter to send, Shift+Enter for new line"
                    : isLive
                      ? "Input available when task needs your response"
                      : ""}
                </p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
