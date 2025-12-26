# Real-Time Streaming Architecture Proposal

## Executive Summary

Replace the current **polling-based** message retrieval system with a **real-time streaming architecture** using Server-Sent Events (SSE). This will eliminate the 1-second delay, reduce bandwidth usage by ~90%, and create a responsive, ChatGPT-like user experience.

---

## Current Problems

### 1. Polling-Based Architecture
- **Frontend polls every 1 second** via `useTerminalPreview` hook
- **1000ms delay** between SDK output and UI display
- **Inefficient**: Fetches entire message history on every poll
- **Bandwidth waste**: Sends duplicate messages repeatedly

### 2. Snapshot-Based Updates
```typescript
// Current flow (packages/daemon/src/web/hooks/useTerminalPreview.ts:52)
refetchInterval: (query) => {
  return data?.isLive ? 1000 : false; // Poll every second!
}
```
- Returns full message array each time
- No incremental updates
- Client must diff to find new messages

### 3. No Real-Time Push
- Server has messages immediately from SDK
- No way to notify clients instantly
- Can't achieve sub-100ms latency

### 4. Limited Interactivity
- No typing indicators
- No partial message streaming
- Messages appear all-at-once (jarring UX)

---

## Proposed Architecture

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude SDK                               │
│                  for await (msg of query(...))                   │
└────────────────────────┬────────────────────────────────────────┘
                         │ Stream messages
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SdkRunner                                   │
│  - Process messages from SDK                                     │
│  - Emit events to EventBus                                       │
│  - Write to transcript (persistence)                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ Emit events
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    StreamEventBus                                │
│  - Task-scoped EventEmitter                                      │
│  - Multiple subscribers per task                                 │
│  - Automatic cleanup on task completion                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ Broadcast to subscribers
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SSE Endpoint (Hono)                             │
│  GET /api/stream/tasks/:taskId                                   │
│  - Server-Sent Events stream                                     │
│  - Automatic reconnection                                        │
│  - Sends new messages only                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP SSE Stream
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Frontend (React Hook)                               │
│  - useTaskStream() hook                                          │
│  - EventSource API                                               │
│  - Incremental state updates                                     │
│  - Automatic reconnection                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Streaming Infrastructure

#### 1.1 StreamEventBus Service

**File**: `packages/daemon/src/streaming/event-bus.ts`

```typescript
import { EventEmitter } from "events";
import type { SdkMessage } from "../executor/sdk";

export interface StreamEvent {
  type: "message" | "status" | "typing" | "complete" | "error";
  taskId: string;
  seq: number;
  timestamp: string;
  data: unknown;
}

export interface MessageEvent extends StreamEvent {
  type: "message";
  data: SdkMessage;
}

export interface TypingEvent extends StreamEvent {
  type: "typing";
  data: { isTyping: boolean };
}

export interface StatusEvent extends StreamEvent {
  type: "status";
  data: { status: string };
}

/**
 * Event bus for streaming task execution updates to clients
 * Manages task-scoped EventEmitters with automatic cleanup
 */
export class StreamEventBus {
  private emitters = new Map<string, EventEmitter>();
  private sequences = new Map<string, number>();

  /**
   * Subscribe to task stream events
   */
  subscribe(taskId: string, handler: (event: StreamEvent) => void): () => void {
    let emitter = this.emitters.get(taskId);

    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(100); // Allow many concurrent viewers
      this.emitters.set(taskId, emitter);
      this.sequences.set(taskId, 0);
    }

    emitter.on("event", handler);

    // Return unsubscribe function
    return () => {
      emitter!.off("event", handler);

      // Clean up if no more listeners
      if (emitter!.listenerCount("event") === 0) {
        this.emitters.delete(taskId);
        this.sequences.delete(taskId);
      }
    };
  }

  /**
   * Emit a stream event for a task
   */
  emit(event: Omit<StreamEvent, "seq" | "timestamp">): void {
    const emitter = this.emitters.get(event.taskId);
    if (!emitter) return; // No subscribers yet

    const seq = this.getNextSeq(event.taskId);
    const fullEvent: StreamEvent = {
      ...event,
      seq,
      timestamp: new Date().toISOString(),
    };

    emitter.emit("event", fullEvent);
  }

  /**
   * Emit a message event (most common)
   */
  emitMessage(taskId: string, message: SdkMessage): void {
    this.emit({
      type: "message",
      taskId,
      data: message,
    });
  }

  /**
   * Emit typing indicator
   */
  emitTyping(taskId: string, isTyping: boolean): void {
    this.emit({
      type: "typing",
      taskId,
      data: { isTyping },
    });
  }

  /**
   * Emit status change
   */
  emitStatus(taskId: string, status: string): void {
    this.emit({
      type: "status",
      taskId,
      data: { status },
    });
  }

  /**
   * Emit completion
   */
  emitComplete(taskId: string): void {
    this.emit({
      type: "complete",
      taskId,
      data: {},
    });

    // Clean up after small delay (allow final messages to be delivered)
    setTimeout(() => {
      this.emitters.delete(taskId);
      this.sequences.delete(taskId);
    }, 5000);
  }

  /**
   * Emit error
   */
  emitError(taskId: string, error: string): void {
    this.emit({
      type: "error",
      taskId,
      data: { error },
    });
  }

  private getNextSeq(taskId: string): number {
    const seq = this.sequences.get(taskId) ?? 0;
    this.sequences.set(taskId, seq + 1);
    return seq;
  }

  /**
   * Get subscriber count for a task (for monitoring)
   */
  getSubscriberCount(taskId: string): number {
    const emitter = this.emitters.get(taskId);
    return emitter ? emitter.listenerCount("event") : 0;
  }
}

// Singleton instance
export const streamEventBus = new StreamEventBus();
```

#### 1.2 Update SdkRunner to Emit Events

**File**: `packages/daemon/src/executor/sdk/sdk-runner.ts` (modifications)

```typescript
import { streamEventBus } from "../../streaming/event-bus";

export class SdkRunner {
  // ... existing code ...

  private async executeQuery(
    prompt: string,
    workDir: string,
    timeout: number,
    model: string,
    sdkSessionId?: string,
    permissionMode?: Options["permissionMode"],
    enableCheckpointing?: boolean,
  ): Promise<SdkRunResult> {
    // ... existing setup code ...

    // NEW: Emit typing indicator when starting
    if (this.sessionManager.taskId) {
      streamEventBus.emitTyping(this.sessionManager.taskId, true);
    }

    try {
      const queryIterator = query({
        prompt,
        options: queryOptions,
      });

      // Process messages from the query
      for await (const msg of queryIterator) {
        if (this.aborted) break;

        const sdkMessage = this.processMessage(msg);
        if (sdkMessage) {
          this.messages.push(sdkMessage);

          // Write to transcript for persistence
          this.sessionManager.writeTranscriptMessage(sdkMessage);

          // NEW: Emit to stream bus for real-time updates
          if (this.sessionManager.taskId) {
            streamEventBus.emitMessage(this.sessionManager.taskId, sdkMessage);
          }
        }

        // ... rest of existing code ...
      }

      // NEW: Emit completion/stop typing
      if (this.sessionManager.taskId) {
        streamEventBus.emitTyping(this.sessionManager.taskId, false);
        streamEventBus.emitComplete(this.sessionManager.taskId);
      }

      // ... existing return logic ...
    } catch (error) {
      // NEW: Emit error
      if (this.sessionManager.taskId) {
        streamEventBus.emitError(
          this.sessionManager.taskId,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
      throw error;
    }
  }
}
```

#### 1.3 SSE Endpoint with Hono

**File**: `packages/daemon/src/server/routes/stream.ts`

```typescript
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { streamEventBus } from "../../streaming/event-bus";
import { getDb, tasks } from "../../db/drizzle";
import { eq } from "drizzle-orm";
import type { StreamEvent } from "../../streaming/event-bus";
import { TranscriptWriter } from "../../executor/transcript-writer";

const streamRouter = new Hono();

/**
 * SSE endpoint for streaming task execution updates
 * GET /stream/tasks/:taskId
 */
streamRouter.get("/tasks/:taskId", async (c) => {
  const { taskId } = c.req.param();
  const db = getDb();

  // Verify task exists
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  // Optional: Get afterSeq from query params for resuming
  const afterSeq = parseInt(c.req.query("afterSeq") ?? "0", 10);

  return stream(c, async (stream) => {
    // Set SSE headers
    stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ taskId, afterSeq }),
      id: "0",
    });

    // Send historical messages first (if task already running/completed)
    try {
      const sessionPath = `${process.env.HOME}/.nightshift/sessions/${taskId}.transcript.ndjson`;
      const historicalMessages = TranscriptWriter.read(sessionPath, afterSeq);

      let seq = afterSeq;
      for (const msg of historicalMessages) {
        seq++;
        const event: StreamEvent = {
          type: "message",
          taskId,
          seq,
          timestamp: msg.timestamp,
          data: msg,
        };

        await stream.writeSSE({
          event: "message",
          data: JSON.stringify(event),
          id: seq.toString(),
        });
      }
    } catch (err) {
      // No transcript yet or error reading - that's ok, will get live updates
    }

    // Subscribe to live updates
    const unsubscribe = streamEventBus.subscribe(taskId, async (event: StreamEvent) => {
      // Only send events after the requested sequence
      if (event.seq <= afterSeq) return;

      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
        id: event.seq.toString(),
      });
    });

    // Send periodic heartbeat to keep connection alive
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch (err) {
        // Connection closed
        clearInterval(heartbeatInterval);
      }
    }, 15000); // Every 15 seconds

    // Wait for client disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
    });

    // Keep stream alive until client disconnects
    await new Promise(() => {}); // Never resolves - stream stays open
  });
});

export { streamRouter };
```

**Integrate into main server** (`packages/daemon/src/server/index.ts`):

```typescript
import { streamRouter } from "./routes/stream";

// ... existing setup ...

app.route("/api/stream", streamRouter);
```

### Phase 2: Frontend Real-Time Hooks

#### 2.1 useTaskStream Hook

**File**: `packages/daemon/src/web/hooks/useTaskStream.ts`

```typescript
import { useEffect, useState, useCallback, useRef } from "react";
import type { SdkMessage } from "@/web/components/TranscriptViewer";

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

/**
 * Real-time streaming hook for task execution
 * Uses Server-Sent Events for instant updates
 */
export function useTaskStream(taskId: string | undefined, options?: {
  enabled?: boolean;
  afterSeq?: number;
}) {
  const { enabled = true, afterSeq = 0 } = options ?? {};

  const [state, setState] = useState<TaskStreamState>({
    messages: [],
    isTyping: false,
    isComplete: false,
    error: null,
    isConnected: false,
    lastSeq: afterSeq,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Create SSE connection
    const url = `/api/stream/tasks/${taskId}?afterSeq=${state.lastSeq}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.addEventListener("connected", (e) => {
      setState((prev) => ({ ...prev, isConnected: true }));
    });

    // Message event
    eventSource.addEventListener("message", (e) => {
      const event: StreamEvent = JSON.parse(e.data);

      if (event.type === "message") {
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, event.data as SdkMessage],
          lastSeq: event.seq,
        }));
      }
    });

    // Typing indicator
    eventSource.addEventListener("typing", (e) => {
      const event: StreamEvent = JSON.parse(e.data);
      const { isTyping } = event.data as { isTyping: boolean };

      setState((prev) => ({ ...prev, isTyping }));
    });

    // Status update
    eventSource.addEventListener("status", (e) => {
      const event: StreamEvent = JSON.parse(e.data);
      // Could update task status in state if needed
    });

    // Completion
    eventSource.addEventListener("complete", (e) => {
      setState((prev) => ({
        ...prev,
        isComplete: true,
        isTyping: false,
      }));

      // Close connection after completion
      setTimeout(() => {
        eventSource.close();
      }, 1000);
    });

    // Error
    eventSource.addEventListener("error", (e) => {
      const event: StreamEvent = JSON.parse(e.data);
      const { error } = event.data as { error: string };

      setState((prev) => ({
        ...prev,
        error,
        isTyping: false,
      }));
    });

    // Connection error (network issue)
    eventSource.onerror = () => {
      setState((prev) => ({ ...prev, isConnected: false }));

      // Attempt reconnection after 2 seconds
      if (!state.isComplete) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    };

    // Heartbeat (keep-alive)
    eventSource.addEventListener("heartbeat", () => {
      // Just keep connection alive, no state update needed
    });

  }, [taskId, enabled, state.lastSeq, state.isComplete]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && taskId) {
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [taskId, enabled, connect]);

  return state;
}
```

#### 2.2 Update TranscriptViewer to Use Streaming

**File**: `packages/daemon/src/web/components/TranscriptViewer.tsx` (modifications)

```typescript
import { useTaskStream } from "@/web/hooks/useTaskStream";

export function TranscriptViewer({
  taskId, // NEW: Pass taskId instead of messages
  prompt,
  className,
  autoScroll = true,
  onFileChanges,
}: {
  taskId: string;
  prompt?: string;
  className?: string;
  autoScroll?: boolean;
  onFileChanges?: (changes: FileChange[]) => void;
}) {
  // NEW: Use streaming hook instead of polling
  const { messages, isTyping, isComplete, isConnected, error } = useTaskStream(taskId);

  // ... rest of component logic stays the same ...

  return (
    <div className="pr-1">
      {/* Connection status indicator */}
      {isConnected && !isComplete && (
        <div className="flex items-center gap-1.5 text-xs mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-400">Live</span>
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div className="mb-2 p-2 rounded bg-red-900/20 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ... existing render logic ... */}

      {/* Typing indicator */}
      {isTyping && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm mt-2">
          <span className="flex gap-1">
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span>Claude is typing...</span>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 3: Advanced Features (Optional Enhancements)

### 3.1 Token-Level Streaming for Long Messages

For truly ChatGPT-like experience, stream assistant message content token-by-token:

**Approach**:
- Modify SdkRunner to emit partial content events as text accumulates
- Frontend shows incremental content updates
- Use CSS transitions for smooth appearance

**Implementation**:

```typescript
// In SdkRunner
private processMessage(msg: SDKMessage): SdkMessage | null {
  // ... existing code ...

  if (msg.type === "assistant") {
    const textContent = content.find((c) => c.type === "text");

    if (textContent) {
      // NEW: Emit partial content for streaming UX
      if (this.sessionManager.taskId) {
        streamEventBus.emit({
          type: "partial-content",
          taskId: this.sessionManager.taskId,
          data: {
            messageId: this.messages.length, // Message index
            partialContent: textContent.text,
          },
        });
      }
    }
  }
}
```

### 3.2 Message Replay for Debugging

Add ability to replay message stream at variable speed:

```typescript
export function useMessageReplay(taskId: string, speed: number = 1.0) {
  // Read transcript, emit events at controlled rate
  // Useful for debugging, demos, or training
}
```

### 3.3 Multi-Task Dashboard Streaming

Stream updates for multiple tasks simultaneously:

```typescript
export function useMultiTaskStream(taskIds: string[]) {
  // Subscribe to multiple task streams
  // Aggregate updates into single state
  // Useful for dashboard view
}
```

---

## Performance Impact

### Before (Polling)

| Metric | Value |
|--------|-------|
| Update Latency | 500-1000ms (avg) |
| Bandwidth (per client/min) | ~100 KB (full snapshots) |
| Server CPU | Low (periodic queries) |
| Scalability | Limited (DB polling) |

### After (SSE Streaming)

| Metric | Value |
|--------|-------|
| Update Latency | 10-50ms (real-time) |
| Bandwidth (per client/min) | ~10 KB (incremental) |
| Server CPU | Low (event bus) |
| Scalability | High (event-driven) |

**Key Improvements**:
- **20x faster** update latency
- **90% less** bandwidth usage
- **No DB polling** (event-driven)
- **100+ concurrent viewers** per task without degradation

---

## Migration Strategy

### Week 1: Infrastructure
- [ ] Implement `StreamEventBus`
- [ ] Add SSE endpoint
- [ ] Update `SdkRunner` to emit events
- [ ] Write unit tests

### Week 2: Frontend
- [ ] Create `useTaskStream` hook
- [ ] Update `TranscriptViewer` component
- [ ] Add typing indicators
- [ ] Add connection status UI

### Week 3: Testing & Rollout
- [ ] Load testing (100+ concurrent streams)
- [ ] Feature flag for gradual rollout
- [ ] Monitor error rates
- [ ] Deprecate old polling endpoint

### Week 4: Enhancements
- [ ] Token-level streaming (optional)
- [ ] Message replay (optional)
- [ ] Multi-task streaming (optional)

---

## Risks & Mitigation

### Risk 1: SSE Connection Limits
**Problem**: Browsers limit SSE connections (typically 6 per domain)
**Mitigation**:
- Multiplex multiple task streams over single connection
- Use connection pooling
- Close connections when tab inactive

### Risk 2: Message Loss on Reconnect
**Problem**: Network interruption could cause missed messages
**Mitigation**:
- Send `lastSeq` on reconnect to resume from last received
- Server sends historical messages since that sequence
- Client deduplicates based on sequence numbers

### Risk 3: Memory Leaks
**Problem**: Event listeners not cleaned up properly
**Mitigation**:
- Automatic cleanup on task completion
- Timeout-based cleanup for abandoned subscriptions
- Monitoring for subscriber count

### Risk 4: Backward Compatibility
**Problem**: Existing clients still using polling
**Mitigation**:
- Keep old `terminal.getPreview` endpoint
- Feature flag for gradual rollout
- Version both in parallel for 2 weeks

---

## Testing Plan

### Unit Tests
```typescript
describe("StreamEventBus", () => {
  it("should emit events to subscribers", () => {
    const bus = new StreamEventBus();
    const events: StreamEvent[] = [];

    bus.subscribe("task_123", (event) => {
      events.push(event);
    });

    bus.emitMessage("task_123", {
      type: "assistant",
      content: "Hello",
      timestamp: new Date().toISOString(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("message");
  });

  it("should clean up when no subscribers", () => {
    const bus = new StreamEventBus();
    const unsubscribe = bus.subscribe("task_123", () => {});

    expect(bus.getSubscriberCount("task_123")).toBe(1);

    unsubscribe();

    expect(bus.getSubscriberCount("task_123")).toBe(0);
  });
});
```

### Integration Tests
```typescript
describe("SSE Streaming", () => {
  it("should stream messages in real-time", async () => {
    // Create task
    const taskId = await createTask({ prompt: "Test" });

    // Connect to SSE stream
    const stream = new EventSource(`/api/stream/tasks/${taskId}`);
    const messages: SdkMessage[] = [];

    stream.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      messages.push(event.data);
    });

    // Execute task (triggers messages)
    await executeTask(taskId);

    // Wait for completion
    await waitForEvent(stream, "complete");

    expect(messages.length).toBeGreaterThan(0);
    stream.close();
  });
});
```

### Load Tests
```bash
# Simulate 100 concurrent viewers
npm run load-test:stream -- --tasks=10 --viewers=10 --duration=60s

# Expected results:
# - p95 latency < 100ms
# - 0% message loss
# - Stable memory usage
```

---

## Success Metrics

### Technical Metrics
- [ ] p95 latency < 100ms (down from 1000ms)
- [ ] Bandwidth reduction > 80%
- [ ] Support 100+ concurrent viewers per task
- [ ] 99.9% message delivery rate
- [ ] Zero memory leaks over 24hr period

### UX Metrics
- [ ] Users perceive updates as "instant"
- [ ] No visible lag in message appearance
- [ ] Typing indicators feel natural
- [ ] Reconnection is seamless

---

## Conclusion

This architecture transforms NightShift from a **polling-based** to **real-time event-driven** system, delivering ChatGPT-level responsiveness while reducing bandwidth by 90%. The modular design allows incremental rollout with minimal risk.

**Next Steps**:
1. Review & approve this proposal
2. Create implementation tickets
3. Begin Phase 1 development
4. Set up monitoring & metrics

---

## Appendix: Alternative Approaches Considered

### WebSockets vs SSE
**Why SSE Wins**:
- Simpler (HTTP-based, no protocol upgrade)
- Built-in reconnection logic
- Works through proxies/firewalls
- One-way communication is sufficient
- Lower latency than WebSocket in practice

### GraphQL Subscriptions
**Why Not**:
- Adds complexity (GraphQL layer)
- Overkill for simple event streaming
- SSE is more lightweight
- No type generation benefits here

### Long Polling
**Why Not**:
- Still has polling latency
- More complex than SSE
- Higher server load
- No real-time push
