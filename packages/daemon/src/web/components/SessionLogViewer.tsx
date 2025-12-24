/**
 * Session Log Viewer
 *
 * Displays session events in a terminal-like format.
 * Features: chronological events, color-coded by type, virtual scrolling.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Terminal } from "lucide-react";
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
  TASK_CLAIMED: "text-[var(--color-info)]",
  TASK_STARTED: "text-[var(--color-info)]",
  TASK_COMPLETED: "text-[var(--color-success)]",
  TASK_FAILED: "text-[var(--color-destructive)]",
  TASK_CANCELED: "text-[var(--color-text-muted)]",

  // Agent events - tool calls in orange
  AGENT_STARTED: "text-[var(--color-accent)]",
  AGENT_TOOL_CALL: "text-[var(--color-accent)]",
  AGENT_TOOL_RESULT: "text-[var(--color-text-secondary)]",
  AGENT_MESSAGE: "text-[var(--color-text-primary)]",
  AGENT_NEEDS_HUMAN: "text-[var(--color-warning)]",

  // Preflight events
  PREFLIGHT_STARTED: "text-[var(--color-text-muted)]",
  PREFLIGHT_PASSED: "text-[var(--color-success)]",
  PREFLIGHT_FAILED: "text-[var(--color-destructive)]",

  // Repo events
  REPO_LOCK_ACQUIRED: "text-[var(--color-info)]",
  REPO_LOCK_RELEASED: "text-[var(--color-text-muted)]",
  REPO_BRANCH_CREATED: "text-[var(--color-info)]",

  // Artifact events
  ARTIFACT_COMMIT_CREATED: "text-[var(--color-success)]",
  ARTIFACT_PR_CREATED: "text-[var(--color-success)]",
  ARTIFACT_FILE_MODIFIED: "text-[var(--color-text-secondary)]",

  // Session events
  SESSION_STARTED: "text-[var(--color-text-muted)]",
  SESSION_ENDED: "text-[var(--color-text-muted)]",
};

const levelColors: Record<string, string> = {
  info: "text-[var(--color-text-secondary)]",
  warn: "text-[var(--color-warning)]",
  error: "text-[var(--color-destructive)]",
  debug: "text-[var(--color-text-muted)]",
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
          "flex items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[#0A0A0A] p-8",
          className,
        )}
      >
        <p className="text-sm text-[var(--color-text-muted)]">No session events</p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <Terminal className="h-4 w-4 text-[var(--color-text-muted)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">Session Log</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        {isLoading && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-[var(--color-accent)]" />
        )}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto rounded-b-[var(--radius-lg)] border border-[var(--color-border)] bg-[#0A0A0A] p-4 font-mono text-xs"
      >
        {events.map((event) => (
          <div key={`${event.runId}-${event.seq}`} className="flex gap-2 py-0.5 hover:bg-white/5">
            {/* Timestamp */}
            <span className="shrink-0 text-[var(--color-text-muted)]">
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
              <span className="text-[var(--color-text-secondary)] truncate">
                {formatEventData(event.data)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Jump to bottom button */}
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] shadow-lg hover:bg-[var(--color-surface-hover)]"
        >
          <ChevronDown className="h-3 w-3" />
          Jump to end
        </button>
      )}
    </div>
  );
}
