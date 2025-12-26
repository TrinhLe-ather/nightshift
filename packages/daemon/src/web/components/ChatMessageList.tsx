/**
 * Chat Message List Component
 *
 * Container for chat messages with auto-scroll and "jump to latest" functionality.
 * Renders session events and task prompt as chat messages.
 */

import { useEffect, useRef, useState } from "react";
import { ChatMessage, type MessageType } from "./ChatMessage";
import { ChevronDown } from "@/components/ui/icons";
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

interface ChatMessageListProps {
  prompt: string;
  promptTimestamp?: string;
  events: SessionEvent[];
  isLoading?: boolean;
  className?: string;
}

// Map session event types to chat message types
function mapEventToMessageType(eventType: string): MessageType | null {
  const mapping: Record<string, MessageType> = {
    // Agent events
    AGENT_MESSAGE: "agent_message",
    AGENT_TOOL_CALL: "agent_tool_call",
    AGENT_TOOL_RESULT: "agent_tool_result",
    AGENT_THINKING: "agent_thinking",
    AGENT_NEEDS_HUMAN: "agent_needs_human",

    // Task events
    TASK_STARTED: "task_started",
    TASK_CLAIMED: "task_started",
    TASK_COMPLETED: "task_completed",
    TASK_FAILED: "task_failed",
    TASK_PAUSED: "task_paused",
    TASK_RESUMED: "task_started",
    TASK_CANCELED: "task_failed",

    // Artifact events
    ARTIFACT_COMMIT_CREATED: "artifact_commit",
    ARTIFACT_PR_CREATED: "artifact_pr",
  };

  return mapping[eventType] || null;
}

// Get content from event data
function getEventContent(event: SessionEvent): string {
  const data = event.data || {};

  // Agent message content
  if (data.message) return String(data.message);
  if (data.content) return String(data.content);
  if (data.text) return String(data.text);

  // Tool calls
  if (event.type === "AGENT_TOOL_CALL") {
    const tool = data.tool || "Unknown";
    return `Calling ${tool}`;
  }

  // Tool results
  if (event.type === "AGENT_TOOL_RESULT") {
    const result = data.result || data.output || "";
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  }

  // Task events
  if (event.type === "TASK_CLAIMED") {
    return "Task received";
  }
  if (event.type === "TASK_STARTED") {
    return "Task started";
  }
  if (event.type === "TASK_COMPLETED") {
    return "Task completed successfully";
  }
  if (event.type === "TASK_FAILED") {
    const error = data.error || data.message || "Unknown error";
    return `Task failed: ${error}`;
  }
  if (event.type === "TASK_PAUSED") {
    const reason = data.reason || "manual";
    return `Task paused (${reason})`;
  }
  if (event.type === "TASK_RESUMED") {
    return "Task resumed";
  }
  if (event.type === "TASK_CANCELED") {
    return "Task canceled";
  }

  // Needs human
  if (event.type === "AGENT_NEEDS_HUMAN") {
    return data.question ? String(data.question) : "Claude needs your input";
  }

  // Artifacts
  if (event.type === "ARTIFACT_COMMIT_CREATED") {
    const sha = data.sha ? String(data.sha).slice(0, 8) : "";
    return `Commit created${sha ? `: ${sha}` : ""}`;
  }
  if (event.type === "ARTIFACT_PR_CREATED") {
    return "Pull Request created";
  }

  // Thinking
  if (event.type === "AGENT_THINKING") {
    return data.thinking ? String(data.thinking) : "";
  }

  // Default
  return event.type;
}

// Filter and dedupe events that should be shown in chat
function filterEventsForChat(events: SessionEvent[]): SessionEvent[] {
  const displayableTypes = new Set([
    "AGENT_MESSAGE",
    "AGENT_TOOL_CALL",
    "AGENT_TOOL_RESULT",
    "AGENT_THINKING",
    "AGENT_NEEDS_HUMAN",
    "TASK_STARTED",
    "TASK_CLAIMED",
    "TASK_COMPLETED",
    "TASK_FAILED",
    "TASK_PAUSED",
    "TASK_RESUMED",
    "TASK_CANCELED",
    "ARTIFACT_COMMIT_CREATED",
    "ARTIFACT_PR_CREATED",
  ]);

  return events.filter((event) => displayableTypes.has(event.type));
}

export function ChatMessageList({
  prompt,
  promptTimestamp,
  events,
  isLoading,
  className,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // Filter events for display
  const displayEvents = filterEventsForChat(events);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayEvents, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;

    setAutoScroll(isAtBottom);
    setShowJumpToBottom(!isAtBottom && distanceFromBottom > 200);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setAutoScroll(true);
      setShowJumpToBottom(false);
    }
  };

  return (
    <div className={cn("relative flex-1 min-h-0 overflow-hidden", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full min-h-0 overflow-y-auto px-4 py-6 space-y-4"
      >
        {/* Original prompt as first message */}
        <ChatMessage type="prompt" content={prompt} timestamp={promptTimestamp} />

        {/* Session events as messages */}
        {displayEvents.map((event) => {
          const messageType = mapEventToMessageType(event.type);
          if (!messageType) return null;

          const content = getEventContent(event);
          if (!content && messageType !== "agent_tool_call") return null;

          return (
            <ChatMessage
              key={`${event.runId}-${event.seq}`}
              type={messageType}
              content={content}
              timestamp={event.ts}
              data={event.data}
            />
          );
        })}

        {/* Loading indicator */}
        {isLoading && displayEvents.length === 0 && (
          <div className="flex justify-center py-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Waiting for activity...
            </div>
          </div>
        )}
      </div>

      {/* Jump to bottom button */}
      {showJumpToBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
