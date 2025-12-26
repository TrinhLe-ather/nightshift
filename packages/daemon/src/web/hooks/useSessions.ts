/**
 * Sessions Hooks
 *
 * Fetches session events for tasks.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { useEffect, useMemo, useRef, useState } from "react";

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

type UseLiveSessionOptions = {
  /**
   * When true, polls for new events and appends them to the existing list.
   * Intended for RUNNING/CLAIMED tasks.
   */
  live?: boolean;
  /**
   * Poll interval used when `live` is enabled.
   */
  pollIntervalMs?: number;
};

/**
 * Live session hook:
 * - Finds the latest session for a task
 * - Loads initial events once
 * - (Optional) polls incrementally via `sessions.getEvents({ after })` and appends
 *
 * This gives a "tail -f" experience in the web UI without introducing SSE/WebSockets.
 */
export function useLiveSession(taskId: string, options?: UseLiveSessionOptions) {
  const live = options?.live ?? false;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;

  // 1) Find latest session metadata
  const metaQuery = useQuery({
    queryKey: ["session-meta", taskId],
    queryFn: async () => {
      const result = await client.sessions.list({ taskId, limit: 1 });
      return result.sessions?.[0] ?? null;
    },
    enabled: !!taskId,
    // Session metadata rarely changes; when live, update occasionally in case a new run is created.
    refetchInterval: live ? 5000 : false,
  });

  const sessionMeta = metaQuery.data;

  // 2) Manage an append-only events list in local state
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [lastSeq, setLastSeq] = useState(0);

  const lastSeqRef = useRef(0);
  useEffect(() => {
    lastSeqRef.current = lastSeq;
  }, [lastSeq]);

  // Reset when session changes (new runId / new session id)
  useEffect(() => {
    setEvents([]);
    setLastSeq(0);
    lastSeqRef.current = 0;
  }, [sessionMeta?.id]);

  // Initial load (full)
  const initialEventsQuery = useQuery({
    queryKey: ["session-events-initial", sessionMeta?.id],
    queryFn: async () => {
      if (!sessionMeta?.id) return { events: [] as SessionEvent[], lastSeq: 0 };
      const result = await client.sessions.getEvents({ id: sessionMeta.id, after: 0 });
      return {
        events: result.events as SessionEvent[],
        lastSeq: result.lastSeq as number,
      };
    },
    enabled: !!sessionMeta?.id,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const initial = initialEventsQuery.data;
    if (!initial) return;
    setEvents(initial.events);
    setLastSeq(initial.lastSeq);
    lastSeqRef.current = initial.lastSeq;
  }, [initialEventsQuery.data]);

  // Incremental polling
  useEffect(() => {
    if (!live) return;
    if (!sessionMeta?.id) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const result = await client.sessions.getEvents({
          id: sessionMeta.id,
          after: lastSeqRef.current,
        });
        if (cancelled) return;

        const newEvents = (result.events as SessionEvent[]) ?? [];
        if (newEvents.length > 0) {
          setEvents((prev) => {
            // De-dupe by seq in case of overlap
            const existing = new Set(prev.map((e) => e.seq));
            const merged = prev.concat(newEvents.filter((e) => !existing.has(e.seq)));
            merged.sort((a, b) => a.seq - b.seq);
            return merged;
          });
          setLastSeq(result.lastSeq as number);
          lastSeqRef.current = result.lastSeq as number;
        }
      } catch {
        // best-effort; ignore transient read errors
      }
    };

    // Kick once immediately, then poll
    void tick();
    const interval = setInterval(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [live, pollIntervalMs, sessionMeta?.id]);

  const data = useMemo<Session | null>(() => {
    if (!sessionMeta) return null;
    return {
      id: sessionMeta.id,
      taskId: sessionMeta.taskId,
      runId: sessionMeta.runId,
      startedAt: sessionMeta.startedAt,
      completedAt: sessionMeta.completedAt ?? undefined,
      eventCount: sessionMeta.eventCount ?? 0,
      events,
    };
  }, [events, sessionMeta]);

  return {
    data,
    isLoading: metaQuery.isLoading || initialEventsQuery.isLoading,
    error: metaQuery.error ?? initialEventsQuery.error,
  };
}
