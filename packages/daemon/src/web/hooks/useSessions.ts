/**
 * Sessions Hooks
 *
 * Fetches session events for tasks.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

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

export interface Session {
  id: string;
  taskId: string;
  runId: string;
  eventsPath: string;
  startedAt: string;
  completedAt?: string;
  eventCount: number;
  events: SessionEvent[];
}

async function fetchSession(taskId: string): Promise<Session | null> {
  const result = await client.sessions.list({ taskId, limit: 1 });

  if (!result.sessions?.length) {
    return null;
  }

  const session = result.sessions[0]!;

  // Fetch events for this session
  const eventsResult = await client.sessions.getEvents({ id: session.id });

  return {
    id: session.id,
    taskId: session.taskId,
    runId: session.runId,
    eventsPath: "",
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? undefined,
    eventCount: session.eventCount ?? 0,
    events: eventsResult.events as SessionEvent[],
  };
}

export function useSession(taskId: string) {
  return useQuery({
    queryKey: ["session", taskId],
    queryFn: () => fetchSession(taskId),
    enabled: !!taskId,
    refetchInterval: 5000, // Refresh every 5 seconds for running tasks
  });
}

export function useSessionEvents(sessionId: string, after = 0) {
  return useQuery({
    queryKey: ["session-events", sessionId, after],
    queryFn: async () => {
      const result = await client.sessions.getEvents({ id: sessionId, after });
      return result.events as SessionEvent[];
    },
    enabled: !!sessionId,
    refetchInterval: 2000,
  });
}
