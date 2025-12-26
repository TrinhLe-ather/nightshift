# oRPC-Native Streaming Refactor Proposal

## Overview

Refactor our custom SSE streaming implementation to use **oRPC's built-in streaming capabilities** via Event Iterators and the Publisher helper. This will simplify code, reduce maintenance burden, and leverage battle-tested streaming primitives.

---

## Current Implementation vs. oRPC Native

### Current (Custom SSE)

**Pros:**
- ✅ Works and is tested
- ✅ Full control over SSE format
- ✅ Custom sequence tracking

**Cons:**
- ❌ 134 lines of custom SSE handling code
- ❌ Manual ReadableStream management
- ❌ Manual SSE event formatting
- ❌ Custom sequence tracking
- ❌ Manual lastEventId handling
- ❌ Separate route outside oRPC

### Proposed (oRPC Native)

**Pros:**
- ✅ **~30 lines of code** (vs 134)
- ✅ Built-in SSE formatting
- ✅ Automatic `lastEventId` handling
- ✅ Type-safe event schemas
- ✅ Integrated with existing oRPC contracts
- ✅ Client-side automatic reconnection
- ✅ Publisher abstraction for pub/sub
- ✅ Built-in cleanup on disconnect

**Cons:**
- ⚠️ Need to migrate existing implementation
- ⚠️ Learning curve for oRPC patterns

---

## Architecture Comparison

### Current Architecture

```
SdkRunner → StreamEventBus → Custom SSE Endpoint → Frontend EventSource
            (EventEmitter)    (ReadableStream)
```

### Proposed Architecture (oRPC Native)

```
SdkRunner → MemoryPublisher → oRPC Event Iterator → Frontend oRPC Client
            (oRPC helper)      (async generator)
```

---

## Implementation Plan

### Step 1: Replace StreamEventBus with MemoryPublisher

**Current** (`src/streaming/event-bus.ts` - 164 lines):
```typescript
export class StreamEventBus {
  private emitters = new Map<string, EventEmitter>();
  private sequences = new Map<string, number>();

  subscribe(taskId: string, handler: (event: StreamEvent) => void) {
    // ... 60 lines of code
  }

  emit(event: Omit<StreamEvent, "seq" | "timestamp">) {
    // ... 20 lines of code
  }

  // ... more methods
}
```

**Proposed** (`src/streaming/publisher.ts` - ~20 lines):
```typescript
import { MemoryPublisher } from 'orpc';

// Define event types
type TaskStreamEvents = {
  message: { taskId: string; message: SdkMessage };
  typing: { taskId: string; isTyping: boolean };
  status: { taskId: string; status: string };
  complete: { taskId: string };
  error: { taskId: string; error: string };
};

// Create publisher singleton
export const taskStreamPublisher = new MemoryPublisher<TaskStreamEvents>();
```

**Benefits:**
- **87% less code** (164 lines → 20 lines)
- Built-in event typing
- Built-in subscriber management
- Built-in cleanup
- No manual sequence tracking needed (oRPC handles this)

### Step 2: Replace Custom SSE Endpoint with oRPC Procedure

**Current** (`src/server/routes/stream.ts` - 134 lines):
```typescript
export async function handleStreamRequest(request: Request): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendSSE = (event: string, data: string, id?: string) => {
        let message = `event: ${event}\n`;
        message += `data: ${data}\n`;
        if (id !== undefined) {
          message += `id: ${id}\n`;
        }
        message += "\n";
        controller.enqueue(encoder.encode(message));
      };

      // ... 100+ more lines
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // ...
    }
  });
}
```

**Proposed** (`src/orpc/contracts/stream.ts` - ~30 lines):
```typescript
import { z } from 'zod';
import { orpc } from '../base';
import { taskStreamPublisher } from '../../streaming/publisher';
import { withEventMeta } from 'orpc/event-iterator';
import { TranscriptWriter } from '../../executor/transcript-writer';

/**
 * Stream task execution updates via SSE
 * Supports resume via lastEventId
 */
const streamTask = orpc
  .input(z.object({
    taskId: z.string(),
  }))
  .handler(async function* ({ input, lastEventId }) {
    const { taskId } = input;

    // Send historical messages if resuming (parse lastEventId for sequence)
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    const sessionPath = `${process.env.HOME}/.nightshift/sessions/${taskId}.transcript.ndjson`;

    try {
      const historicalEntries = TranscriptWriter.readEntries(sessionPath, afterSeq);
      for (const entry of historicalEntries) {
        yield withEventMeta(
          {
            type: 'message',
            taskId,
            data: entry.message,
          },
          { id: entry.seq.toString() }
        );
      }
    } catch {
      // No historical messages
    }

    // Subscribe to live events (automatically cleaned up on disconnect)
    const iterator = taskStreamPublisher.subscribe('*', { signal: this.signal });

    for await (const event of iterator) {
      // Filter events for this specific task
      if (event.payload.taskId === taskId) {
        yield withEventMeta(event.payload, {
          id: Date.now().toString(), // Use timestamp as event ID
        });
      }
    }
  });

export const streamRouter = {
  streamTask,
} as const;
```

**Benefits:**
- **77% less code** (134 lines → 30 lines)
- No manual SSE formatting
- No manual ReadableStream management
- Automatic cleanup on disconnect via `signal`
- Built-in `lastEventId` support
- Type-safe with Zod schemas
- Integrated with oRPC ecosystem

### Step 3: Update SdkRunner to Use Publisher

**Current** (`src/executor/sdk/sdk-runner.ts`):
```typescript
import { streamEventBus } from "../../streaming/event-bus";

// Emit events
streamEventBus.emitMessage(this.sessionManager.taskId, sdkMessage);
streamEventBus.emitTyping(this.sessionManager.taskId, true);
streamEventBus.emitComplete(this.sessionManager.taskId);
streamEventBus.emitError(this.sessionManager.taskId, error);
```

**Proposed**:
```typescript
import { taskStreamPublisher } from "../../streaming/publisher";

// Publish events
await taskStreamPublisher.publish('message', {
  taskId: this.sessionManager.taskId,
  message: sdkMessage,
});

await taskStreamPublisher.publish('typing', {
  taskId: this.sessionManager.taskId,
  isTyping: true,
});

await taskStreamPublisher.publish('complete', {
  taskId: this.sessionManager.taskId,
});

await taskStreamPublisher.publish('error', {
  taskId: this.sessionManager.taskId,
  error: errorMessage,
});
```

**Benefits:**
- Same API surface (minor changes)
- More explicit event types
- Better type safety

### Step 4: Update Frontend to Use oRPC Client

**Current** (`src/web/hooks/useTaskStream.ts` - 156 lines):
```typescript
const connect = useCallback(() => {
  const url = `/api/stream/tasks/${taskId}?afterSeq=${lastSeqRef.current}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener("connected", (e) => { /* ... */ });
  eventSource.addEventListener("message", (e) => { /* ... */ });
  eventSource.addEventListener("typing", (e) => { /* ... */ });
  // ... 100+ more lines
}, [taskId, enabled]);
```

**Proposed** (~80 lines):
```typescript
import { client } from '@/web/integrations/orpc';

export function useTaskStream(taskId: string | undefined) {
  const [state, setState] = useState<TaskStreamState>({
    messages: [],
    isTyping: false,
    isComplete: false,
    error: null,
    isConnected: false,
  });

  useEffect(() => {
    if (!taskId) return;

    const abortController = new AbortController();

    (async () => {
      try {
        setState(prev => ({ ...prev, isConnected: true }));

        // oRPC client automatically handles SSE connection
        const iterator = client.stream.streamTask({ taskId }, {
          signal: abortController.signal,
        });

        for await (const event of iterator) {
          // Process events based on type
          if (event.type === 'message') {
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, event.data],
            }));
          } else if (event.type === 'typing') {
            setState(prev => ({ ...prev, isTyping: event.data.isTyping }));
          } else if (event.type === 'complete') {
            setState(prev => ({ ...prev, isComplete: true, isTyping: false }));
            break;
          } else if (event.type === 'error') {
            setState(prev => ({ ...prev, error: event.data.error }));
          }
        }
      } catch (error) {
        // Auto-reconnect handled by oRPC client
        setState(prev => ({ ...prev, isConnected: false }));
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [taskId]);

  return state;
}
```

**Benefits:**
- **48% less code** (156 lines → 80 lines)
- No manual EventSource management
- Automatic reconnection with lastEventId
- Type-safe event consumption
- AbortController for cleanup
- Built-in error handling

---

## Migration Strategy

### Phase 1: Create New oRPC Streaming (Parallel)
1. Create `src/streaming/publisher.ts` with MemoryPublisher
2. Create `src/orpc/contracts/stream.ts` with event iterator
3. Add to oRPC router
4. Test with new endpoint

### Phase 2: Update SdkRunner (Dual Emit)
1. Import both `streamEventBus` and `taskStreamPublisher`
2. Emit to both systems in parallel
3. Verify both work independently

### Phase 3: Update Frontend (Feature Flag)
1. Create new `useTaskStreamV2` hook with oRPC client
2. Add feature flag to switch between hooks
3. Test with small percentage of users

### Phase 4: Full Migration
1. Switch all users to new hook
2. Remove old `useTaskStream` hook
3. Remove custom SSE endpoint
4. Remove `StreamEventBus`
5. Update SdkRunner to only use Publisher

### Phase 5: Cleanup
1. Delete `src/server/routes/stream.ts` (134 lines)
2. Delete `src/streaming/event-bus.ts` (164 lines)
3. Delete `src/web/hooks/useTaskStream.ts` (156 lines)
4. **Total removed: 454 lines**
5. **Total added: ~130 lines**
6. **Net reduction: 324 lines (71% less code)**

---

## Code Comparison Summary

| Component | Current Lines | Proposed Lines | Reduction |
|-----------|---------------|----------------|-----------|
| Event Bus | 164 | 20 (Publisher) | **-88%** |
| SSE Endpoint | 134 | 30 (oRPC handler) | **-78%** |
| Frontend Hook | 156 | 80 (oRPC client) | **-49%** |
| **Total** | **454** | **130** | **-71%** |

---

## Benefits Summary

### Developer Experience
- ✅ **71% less code** to maintain
- ✅ Better type safety with oRPC schemas
- ✅ No manual SSE formatting
- ✅ Built-in reconnection logic
- ✅ Automatic cleanup
- ✅ Integrated with existing oRPC contracts

### Performance
- ✅ Same or better (oRPC is optimized)
- ✅ Built-in event ID tracking
- ✅ Efficient resume on reconnect

### Reliability
- ✅ Battle-tested oRPC primitives
- ✅ Automatic error handling
- ✅ Built-in signal management
- ✅ Type-safe pub/sub

### Scalability
- ✅ MemoryPublisher for single-server (current)
- ✅ Easy upgrade to IORedisPublisher for distributed systems
- ✅ Supports Cloudflare Workers (PublisherDurableObject)

---

## Risks & Mitigation

### Risk 1: Migration Complexity
**Mitigation**: Parallel implementation with feature flag rollout

### Risk 2: oRPC Client Learning Curve
**Mitigation**: Existing team familiarity with oRPC

### Risk 3: MemoryPublisher Limitations
**Mitigation**: Easy upgrade path to Redis-based publisher if needed

### Risk 4: Custom Sequence Tracking Lost
**Mitigation**: Use timestamps as event IDs (built-in oRPC support)

---

## Example: Complete oRPC Streaming Implementation

### Backend Publisher
```typescript
// src/streaming/publisher.ts
import { MemoryPublisher } from 'orpc';
import type { SdkMessage } from '../executor/sdk';

type TaskStreamEvents = {
  message: { taskId: string; message: SdkMessage };
  typing: { taskId: string; isTyping: boolean };
  complete: { taskId: string };
  error: { taskId: string; error: string };
};

export const taskStreamPublisher = new MemoryPublisher<TaskStreamEvents>();
```

### Backend oRPC Procedure
```typescript
// src/orpc/contracts/stream.ts
import { z } from 'zod';
import { orpc } from '../base';
import { taskStreamPublisher } from '../../streaming/publisher';
import { withEventMeta } from 'orpc/event-iterator';

const streamTask = orpc
  .input(z.object({ taskId: z.string() }))
  .handler(async function* ({ input, lastEventId, signal }) {
    const { taskId } = input;

    // Historical messages (resume support)
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    // ... send historical messages with withEventMeta()

    // Live events
    const iterator = taskStreamPublisher.subscribe('*', { signal });
    for await (const event of iterator) {
      if (event.payload.taskId === taskId) {
        yield withEventMeta(event.payload, {
          id: Date.now().toString(),
        });
      }
    }
  });

export const streamRouter = { streamTask };
```

### Frontend Hook
```typescript
// src/web/hooks/useTaskStream.ts
import { client } from '@/web/integrations/orpc';

export function useTaskStream(taskId: string | undefined) {
  const [state, setState] = useState<TaskStreamState>({
    messages: [],
    isTyping: false,
    isComplete: false,
    error: null,
    isConnected: false,
  });

  useEffect(() => {
    if (!taskId) return;

    const abortController = new AbortController();

    (async () => {
      setState(prev => ({ ...prev, isConnected: true }));

      const iterator = client.stream.streamTask(
        { taskId },
        { signal: abortController.signal }
      );

      for await (const event of iterator) {
        if (event.type === 'message') {
          setState(prev => ({
            ...prev,
            messages: [...prev.messages, event.data.message],
          }));
        }
        // ... handle other events
      }
    })();

    return () => abortController.abort();
  }, [taskId]);

  return state;
}
```

### SdkRunner Integration
```typescript
// src/executor/sdk/sdk-runner.ts
import { taskStreamPublisher } from '../../streaming/publisher';

// In executeQuery():
await taskStreamPublisher.publish('typing', {
  taskId: this.sessionManager.taskId!,
  isTyping: true,
});

await taskStreamPublisher.publish('message', {
  taskId: this.sessionManager.taskId!,
  message: sdkMessage,
});

await taskStreamPublisher.publish('complete', {
  taskId: this.sessionManager.taskId!,
});
```

---

## Recommendation

**Strongly recommend** refactoring to use oRPC's built-in streaming:

1. **71% less code** to maintain
2. **Built-in SSE handling** (no manual formatting)
3. **Type-safe pub/sub** with MemoryPublisher
4. **Automatic reconnection** with lastEventId
5. **Easy scaling** (upgrade to Redis publisher later)
6. **Battle-tested** oRPC primitives

The migration can be done incrementally with feature flags, minimizing risk while maximizing benefits.

---

## Next Steps

1. **Prototype** oRPC streaming endpoint alongside existing implementation
2. **Test** with sample task to verify functionality
3. **Benchmark** performance comparison
4. **Migrate** frontend to oRPC client with feature flag
5. **Full rollout** after verification
6. **Cleanup** old implementation

**Estimated Effort**: 4-6 hours (vs weeks of maintaining custom SSE code)
**Risk Level**: Low (parallel implementation, gradual rollout)
**Reward**: Massive reduction in complexity and maintenance burden
