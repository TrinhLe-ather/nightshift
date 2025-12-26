/**
 * Task Timeline Hook
 *
 * Combines SDK messages and session events into a unified chronological timeline.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { useTerminalPreview } from "./useTerminalPreview";
import type { SdkMessage } from "./useTerminalPreview";

export interface SessionEvent {
  schemaVersion: number;
  ts: string;
  seq: number;
  level: string;
  type: string;
  taskId: string;
  runId: string;
  data?: Record<string, unknown>;
}

export type TimelineItem =
  | { itemType: "message"; data: SdkMessage }
  | { itemType: "event"; data: SessionEvent };

/**
 * Hook to fetch combined timeline of messages and events for a task
 */
export function useTaskTimeline(
  taskId: string | undefined,
  options?: { enabled?: boolean; pollInterval?: number },
) {
  const enabled = options?.enabled ?? true;
  const pollInterval = options?.pollInterval ?? 1000;

  // Fetch terminal messages (SDK messages)
  const { data: terminalData, isLoading: terminalLoading } = useTerminalPreview(taskId, {
    enabled,
    pollInterval,
  });

  // Fetch session events
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions", taskId],
    queryFn: async () => {
      if (!taskId) return { sessions: [] };
      return client.sessions.list({ taskId, limit: 100 });
    },
    enabled: enabled && !!taskId,
    refetchInterval: terminalData?.isLive ? pollInterval : false,
  });

  // Fetch events for the most recent session
  const sessionId = sessionsData?.sessions[0]?.id;
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["session-events", sessionId],
    queryFn: async () => {
      if (!sessionId) return { events: [] };
      return client.sessions.get({ id: sessionId });
    },
    enabled: enabled && !!sessionId,
    refetchInterval: terminalData?.isLive ? pollInterval : false,
  });

  // Merge messages and events chronologically
  const timeline = useMemo(() => {
    const messages = terminalData?.messages || [];
    const events = eventsData?.events || [];

    const items: TimelineItem[] = [
      ...messages.map((msg): TimelineItem => ({ itemType: "message", data: msg })),
      ...events.map((evt): TimelineItem => ({ itemType: "event", data: evt })),
    ];

    // Sort by timestamp
    items.sort((a, b) => {
      const timeA = a.itemType === "message" ? a.data.timestamp : a.data.ts;
      const timeB = b.itemType === "message" ? b.data.timestamp : b.data.ts;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    return items;
  }, [terminalData?.messages, eventsData?.events]);

  return {
    timeline,
    messages: terminalData?.messages || [],
    events: eventsData?.events || [],
    isLive: terminalData?.isLive ?? false,
    isLoading: terminalLoading || sessionsLoading || eventsLoading,
  };
}
