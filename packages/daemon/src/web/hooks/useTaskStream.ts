/**
 * Real-time streaming hook for task execution
 * Uses oRPC event-iterator (SSE under the hood) for instant updates
 */

import { useEffect, useState, useCallback, useRef } from "react";
import type { SdkMessage } from "@/components/TranscriptViewer";
import { client } from "@/web/integrations/orpc";

export interface StreamEvent {
  type: "message" | "status" | "typing" | "complete" | "error";
  taskId: string;
  seq: number;
  timestamp: string;
  data: unknown;
}

export interface TaskStreamState {
  messages: SdkMessage[];
  isTyping: boolean;
  isComplete: boolean;
  error: string | null;
  isConnected: boolean;
  lastSeq: number;
}

function createInitialState(afterSeq: number): TaskStreamState {
  return {
    messages: [],
    isTyping: false,
    isComplete: false,
    error: null,
    isConnected: false,
    lastSeq: afterSeq,
  };
}

/**
 * Real-time streaming hook for task execution
 * Uses Server-Sent Events for instant updates
 */
export function useTaskStream(
  taskId: string | undefined,
  options?: {
    enabled?: boolean;
    afterSeq?: number;
  },
) {
  const { enabled = true, afterSeq = 0 } = options ?? {};

  const [state, setState] = useState<TaskStreamState>(() => createInitialState(afterSeq));

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isCompleteRef = useRef(false);
  const lastSeqRef = useRef(afterSeq);
  const prevTaskIdRef = useRef<string | undefined>(taskId);
  const prevAfterSeqRef = useRef<number>(afterSeq);

  // Update refs when state changes
  useEffect(() => {
    isCompleteRef.current = state.isComplete;
    lastSeqRef.current = state.lastSeq;
  }, [state.isComplete, state.lastSeq]);

  // Reset local state + stream cursor when switching tasks (or changing cursor).
  useEffect(() => {
    const taskChanged = prevTaskIdRef.current !== taskId;
    const cursorChanged = prevAfterSeqRef.current !== afterSeq;

    if (!taskChanged && !cursorChanged) return;

    prevTaskIdRef.current = taskId;
    prevAfterSeqRef.current = afterSeq;

    // Stop any in-flight stream/reconnect loop tied to the previous task.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("useTaskStream task change");
      abortControllerRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    isCompleteRef.current = false;
    lastSeqRef.current = afterSeq;
    setState(createInitialState(afterSeq));
  }, [taskId, afterSeq]);

  const connect = useCallback(async () => {
    if (!taskId || !enabled) return;

    // Abort existing stream (if any)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("useTaskStream connect");
      abortControllerRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({ ...prev, isConnected: false }));

    try {
      const iterator = await client.stream.task(
        { taskId, afterSeq: lastSeqRef.current },
        { signal: controller.signal },
      );

      // Stream is established
      setState((prev) => ({ ...prev, isConnected: true }));

      for await (const event of iterator as AsyncIterable<StreamEvent>) {
        if (event.type === "message") {
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, event.data as SdkMessage],
            lastSeq: event.seq,
          }));
          continue;
        }

        if (event.type === "typing") {
          const { isTyping } = event.data as { isTyping: boolean };
          setState((prev) => ({ ...prev, isTyping }));
          continue;
        }

        if (event.type === "complete") {
          setState((prev) => ({
            ...prev,
            isComplete: true,
            isTyping: false,
          }));
          return;
        }

        if (event.type === "error") {
          const { error } = event.data as { error: string };
          setState((prev) => ({
            ...prev,
            error,
            isTyping: false,
          }));
          return;
        }

        // status: currently ignored by UI, but keep lastSeq updated for resume
        setState((prev) => ({ ...prev, lastSeq: Math.max(prev.lastSeq, event.seq) }));
      }
    } catch (err) {
      // Ignore aborts
      if (controller.signal.aborted) return;

      console.error("[useTaskStream] stream error", err);
      setState((prev) => ({ ...prev, isConnected: false }));

      // Attempt reconnection after 2 seconds if not complete
      if (!isCompleteRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          void connect();
        }, 2000);
      }
    }
  }, [taskId, enabled]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && taskId) {
      void connect();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort("useTaskStream unmount");
        abortControllerRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [taskId, enabled, connect]);

  return state;
}
