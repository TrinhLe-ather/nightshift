/**
 * Session Log Viewer
 *
 * Displays session events in a terminal-like format.
 * Features: chronological events, color-coded by type, virtual scrolling.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Terminal } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface SessionEvent {
  schemaVersion: number;
  ts: string;
  seq: number;
  level: "info" | "warn" | "error" | "debug";
  type: string;
  taskId: string;
  runId: string;
  data?: Record<string, unknown>;
}

interface SessionLogViewerProps {
  events: SessionEvent[];
  startTime?: string;
  isLoading?: boolean;
  className?: string;
}

const eventTypeColors: Record<string, string> = {
  // Task events
  TASK_CLAIMED: "text-blue-500",
  TASK_STARTED: "text-blue-500",
  TASK_COMPLETED: "text-emerald-500",
  TASK_FAILED: "text-destructive",
  TASK_CANCELED: "text-muted-foreground",

  // Agent events - tool calls in orange
  AGENT_STARTED: "text-primary",
  AGENT_TOOL_CALL: "text-primary",
  AGENT_TOOL_RESULT: "text-muted-foreground",
  AGENT_MESSAGE: "text-foreground",
  AGENT_NEEDS_HUMAN: "text-amber-500",

  // Preflight events
  PREFLIGHT_STARTED: "text-muted-foreground",
  PREFLIGHT_PASSED: "text-emerald-500",
  PREFLIGHT_FAILED: "text-destructive",

  // Repo events
  REPO_LOCK_ACQUIRED: "text-blue-500",
  REPO_LOCK_RELEASED: "text-muted-foreground",
  REPO_BRANCH_CREATED: "text-blue-500",

  // Artifact events
  ARTIFACT_COMMIT_CREATED: "text-emerald-500",
  ARTIFACT_PR_CREATED: "text-emerald-500",
  ARTIFACT_FILE_MODIFIED: "text-muted-foreground",

  // Session events
  SESSION_STARTED: "text-muted-foreground",
  SESSION_ENDED: "text-muted-foreground",
};

const levelColors: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-500",
  error: "text-destructive",
  debug: "text-muted-foreground/70",
};

function formatRelativeTime(eventTime: string, startTime: string): string {
  const start = new Date(startTime).getTime();
  const event = new Date(eventTime).getTime();
  const diffMs = event - start;

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatEventData(data: Record<string, unknown> | undefined): string {
  if (!data) return "";

  // Format specific data fields nicely
  const parts: string[] = [];

  if (data.tool) parts.push(`tool=${data.tool}`);
  if (data.file) parts.push(`file=${data.file}`);
  if (data.branch) parts.push(`branch=${data.branch}`);
  if (data.sha) parts.push(`sha=${String(data.sha).substring(0, 8)}`);
  if (data.url) parts.push(`url=${data.url}`);
  if (data.error) parts.push(`error="${data.error}"`);
  if (data.message) parts.push(`"${data.message}"`);
  if (data.question) parts.push(`"${data.question}"`);

  return parts.join(" ");
}

export function SessionLogViewer({
  events,
  startTime,
  isLoading,
  className,
}: SessionLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const effectiveStartTime = startTime || events[0]?.ts || new Date().toISOString();

  if (events.length === 0 && !isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-border bg-[#0A0A0A] p-8",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">No session events</p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border border-b-0 border-border bg-card px-4 py-2 text-card-foreground">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Session Log</span>
        <span className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        {isLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto border border-border bg-[#0A0A0A] p-4 font-mono text-xs"
      >
        {events.map((event) => (
          <div key={`${event.runId}-${event.seq}`} className="flex gap-2 py-0.5 hover:bg-white/5">
            {/* Timestamp */}
            <span className="shrink-0 text-muted-foreground">
              [{formatRelativeTime(event.ts, effectiveStartTime)}]
            </span>

            {/* Event type */}
            <span
              className={cn("shrink-0", eventTypeColors[event.type] || levelColors[event.level])}
            >
              {event.type}
            </span>

            {/* Event data */}
            {event.data && (
              <span className="text-muted-foreground truncate">{formatEventData(event.data)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Jump to bottom button */}
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1 bg-card px-2 py-1 text-xs text-muted-foreground shadow-lg hover:bg-muted"
        >
          <ChevronDown className="h-3 w-3" />
          Jump to end
        </button>
      )}
    </div>
  );
}
