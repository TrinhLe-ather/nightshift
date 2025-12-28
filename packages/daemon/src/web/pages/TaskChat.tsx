/**
 * Task Chat Page
 *
 * Unified chat-like interface for viewing and interacting with tasks.
 * Features a task list sidebar and a chat-style message view.
 *
 * Mobile: Uses bottom sheets for task list and changed files
 * Desktop: Uses resizable panels
 */

import { useState, useCallback, useMemo, useRef, useEffect, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useTask, useContinueTask, useTasks } from "@/hooks/useTasks";
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
import { BottomSheet, FloatingActionButton } from "@/components/ui/bottom-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
  ListTodo,
  FileCode,
  ChevronUp,
} from "@/components/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { MODEL_OPTIONS, getModelColor } from "@/web/lib/models";
import { Kbd } from "../components/ui/kbd";

const TASKCHAT_TASKLIST_SIZE_KEY = "taskchat_tasklist_size";

/** Reusable continue task input component */
function ContinueTaskInput({
  value,
  onChange,
  onSubmit,
  model,
  onModelChange,
  disabled,
  isPending,
  isMobile,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  model: string;
  onModelChange: (model: string) => void;
  disabled: boolean;
  isPending: boolean;
  isMobile: boolean;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border/50 bg-card",
        isMobile ? "p-3 pb-[calc(0.75rem+56px)]" : "p-4",
      )}
    >
      <form onSubmit={onSubmit}>
        <InputGroup>
          <InputGroupTextarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              isMobile ? "Continue this task..." : "Continue this task with a follow-up prompt..."
            }
            className={
              isMobile ? "min-h-[50px] max-h-[120px] text-sm" : "min-h-[60px] max-h-[200px]"
            }
            disabled={disabled}
            onKeyDown={
              isMobile || disabled
                ? undefined
                : (e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      onSubmit(e);
                    }
                  }
            }
          />
          <InputGroupAddon align="block-end">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <InputGroupButton variant="outline">
                  <span className={model ? getModelColor(model) : ""}>
                    {model ? MODEL_OPTIONS.find((m) => m.value === model)?.label : "Model"}
                  </span>
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-36">
                {MODEL_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value || "_default"}
                    onClick={() => onModelChange(option.value)}
                  >
                    <span className={option.color}>{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isMobile && (
              <InputGroupText className="ml-auto">
                <Kbd className="px-1 py-0.5 bg-muted text-[10px]">⌘</Kbd>+
                <Kbd className="px-1 py-0.5 bg-muted text-[10px]">Enter</Kbd>
              </InputGroupText>
            )}
            <Separator orientation="vertical" className={cn("h-4", isMobile && "ml-auto")} />
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-xs"
              disabled={disabled || !value.trim() || isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
              <span className="sr-only">Send</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
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

/** Task header component - shared between mobile and desktop */
function TaskHeader({
  task,
  isLive,
  fileChanges,
  sidebarCollapsed,
  onToggleSidebar,
  formattedCreatedAt,
  taskDuration,
  isMobile,
}: {
  task: NonNullable<ReturnType<typeof useTask>["data"]>;
  isLive: boolean;
  fileChanges: FileChange[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  formattedCreatedAt: string | null;
  taskDuration: string | null;
  isMobile: boolean;
}) {
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
        <div className={cn("absolute left-0 top-0 h-full w-1", statusStyle.bgColor)} />

        <div className="flex items-start justify-between gap-3 px-4 py-3 pl-5">
          <div className="min-w-0 flex-1">
            {/* Task ID as title */}
            <div className="text-sm font-medium text-foreground">Task #{task.id.slice(0, 8)}</div>

            {/* Metadata row - simplified on mobile */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {task.repoPath && (
                <span className="flex items-center gap-1">
                  <FolderGit2 className="h-3 w-3" />
                  <span
                    className={cn(
                      "font-mono truncate",
                      isMobile ? "max-w-[100px]" : "max-w-[150px]",
                    )}
                    title={task.repoPath}
                  >
                    {task.repoPath.split("/").pop()}
                  </span>
                </span>
              )}
              {!isMobile && task.branch && (
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
              {!isMobile && taskDuration && (
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {taskDuration}
                </span>
              )}
              {!isMobile && task.executionMode && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider"
                >
                  {task.executionMode}
                </Badge>
              )}
              {!isMobile && task.priority && task.priority !== "medium" && (
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
              {/* Live indicator - inline with metadata */}
              {isLive && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider",
                    "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                    "animate-pulse",
                  )}
                >
                  Live
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
                {!isMobile && "PR"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {/* Only show sidebar toggle on desktop */}
            {!isMobile && fileChanges.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onToggleSidebar}
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
              )}
            >
              {task.status.toLowerCase().replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Main content area - shared between mobile and desktop */
function TaskContent({
  task,
  taskId,
  taskLoading,
  taskError,
  events,
  onFileChanges,
  fileChanges,
  sidebarCollapsed,
  isMobile,
}: {
  task: ReturnType<typeof useTask>["data"];
  taskId: string;
  taskLoading: boolean;
  taskError: Error | null;
  events: SessionEvent[];
  onFileChanges: (changes: FileChange[]) => void;
  fileChanges: FileChange[];
  sidebarCollapsed: boolean;
  isMobile: boolean;
}) {
  // Loading state
  if (taskLoading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (taskError) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Task not found</p>
      </div>
    );
  }

  // No task selected (mobile)
  if (!task) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8">
        <ListTodo className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-center">Select a task to view details</p>
      </div>
    );
  }

  // Chat Messages
  return (
    <div className={cn("flex-1 flex gap-3 overflow-hidden", isMobile ? "p-2" : "p-4")}>
      {/* Main transcript view */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <TranscriptViewer
          key={taskId}
          taskId={taskId}
          events={events}
          prompt={task.prompt}
          promptTimestamp={task.createdAt}
          onFileChanges={onFileChanges}
          autoScroll={true}
          className="h-full min-h-0"
        />
      </div>

      {/* Changed files sidebar - desktop only */}
      {!isMobile && fileChanges.length > 0 && !sidebarCollapsed && (
        <div className="min-w-80 shrink-0 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            <ChangedFilesList changes={fileChanges} variant="card" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskChat() {
  const { id } = useParams<{ id: string }>();
  const taskId = id ?? "";
  const isMobile = useIsMobile();

  const { data: task, isLoading: taskLoading, error: taskError } = useTask(taskId);
  const isLive = task?.status === "claimed" || task?.status === "running";
  const isTerminal = ["completed", "failed", "canceled"].includes(task?.status ?? "");

  // Get task count for peek bar
  const { data: tasksData } = useTasks({ limit: 1, offset: 0 });
  const totalTasks = tasksData?.pagination?.total ?? 0;

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
  const showContinueInput = !!task?.sdkSessionId;
  const canSubmitContinue = isTerminal && !continueTask.isPending;

  const handleContinueSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!taskId || !continuePrompt.trim() || !canSubmitContinue) return;

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
    [taskId, continuePrompt, continueModel, continueTask, canSubmitContinue],
  );

  // Mobile-specific state
  const [taskListOpen, setTaskListOpen] = useState(false);
  const [filesSheetOpen, setFilesSheetOpen] = useState(false);

  // Avoid flashing stale changed-files UI when switching tasks.
  useEffect(() => {
    setFileChanges([]);
    setSidebarCollapsed(false);
    // Close sheets when task changes on mobile
    if (isMobile) {
      setTaskListOpen(false);
      setFilesSheetOpen(false);
    }
  }, [taskId, isMobile]);

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

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Task Header */}
        {task && (
          <TaskHeader
            task={task}
            isLive={isLive}
            fileChanges={fileChanges}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            formattedCreatedAt={formattedCreatedAt}
            taskDuration={taskDuration}
            isMobile={true}
          />
        )}

        {/* Main Content - full width */}
        <TaskContent
          task={task}
          taskId={taskId}
          taskLoading={taskLoading}
          taskError={taskError}
          events={(eventsData?.events as SessionEvent[]) ?? EMPTY_EVENTS}
          onFileChanges={handleFileChanges}
          fileChanges={fileChanges}
          sidebarCollapsed={sidebarCollapsed}
          isMobile={true}
        />

        {/* Continue Task Input - Mobile */}
        {showContinueInput && (
          <ContinueTaskInput
            value={continuePrompt}
            onChange={setContinuePrompt}
            onSubmit={handleContinueSubmit}
            model={continueModel}
            onModelChange={setContinueModel}
            disabled={!canSubmitContinue}
            isPending={continueTask.isPending}
            isMobile={true}
          />
        )}

        {/* Changed Files FAB - only show when there are changes */}
        {fileChanges.length > 0 && (
          <FloatingActionButton
            icon={<FileCode className="h-6 w-6" />}
            badge={fileChanges.length}
            onClick={() => setFilesSheetOpen(true)}
            aria-label="View changed files"
          />
        )}

        {/* Task List Bottom Sheet */}
        <BottomSheet
          open={taskListOpen}
          onOpenChange={setTaskListOpen}
          peekContent={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tasks</span>
                <Badge variant="secondary" className="text-xs">
                  {totalTasks}
                </Badge>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
          }
          peekHeight={56}
        >
          <div className="h-[70svh] overflow-hidden">
            <TaskListSidebar selectedTaskId={taskId} onTaskSelect={() => setTaskListOpen(false)} />
          </div>
        </BottomSheet>

        {/* Changed Files Bottom Sheet */}
        <BottomSheet
          open={filesSheetOpen}
          onOpenChange={setFilesSheetOpen}
          className="max-h-[80svh]"
        >
          <div className="px-4 pb-2 border-b border-border">
            <h3 className="text-sm font-medium">Changed Files</h3>
            <p className="text-xs text-muted-foreground">{fileChanges.length} files modified</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ChangedFilesList changes={fileChanges} variant="card" />
          </div>
        </BottomSheet>
      </div>
    );
  }

  // Desktop Layout
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
              <TaskHeader
                task={task}
                isLive={isLive}
                fileChanges={fileChanges}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                formattedCreatedAt={formattedCreatedAt}
                taskDuration={taskDuration}
                isMobile={false}
              />
            )}

            {/* Main Content */}
            <TaskContent
              task={task}
              taskId={taskId}
              taskLoading={taskLoading}
              taskError={taskError}
              events={(eventsData?.events as SessionEvent[]) ?? EMPTY_EVENTS}
              onFileChanges={handleFileChanges}
              fileChanges={fileChanges}
              sidebarCollapsed={sidebarCollapsed}
              isMobile={false}
            />

            {/* Continue Task Input */}
            {showContinueInput && (
              <ContinueTaskInput
                value={continuePrompt}
                onChange={setContinuePrompt}
                onSubmit={handleContinueSubmit}
                model={continueModel}
                onModelChange={setContinueModel}
                disabled={!canSubmitContinue}
                isPending={continueTask.isPending}
                isMobile={false}
              />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
