/**
 * Quick integration test for streaming infrastructure
 * Run with: bun run packages/daemon/src/streaming/__test__.ts
 */

import { streamEventBus } from "./event-bus";
import type { StreamEvent } from "./event-bus";

console.log("Testing StreamEventBus...");

// Test 1: Basic subscribe and emit
const events: StreamEvent[] = [];
const unsubscribe = streamEventBus.subscribe("test_task_1", (event) => {
  events.push(event);
});

streamEventBus.emitMessage("test_task_1", {
  type: "assistant",
  content: "Hello world",
  timestamp: new Date().toISOString(),
});

streamEventBus.emitTyping("test_task_1", true);
streamEventBus.emitTyping("test_task_1", false);
streamEventBus.emitComplete("test_task_1");

console.log(`✓ Received ${events.length} events`);
console.log(`✓ Event types: ${events.map(e => e.type).join(", ")}`);

// Test 2: Verify sequence numbers
const sequences = events.map(e => e.seq);
console.log(`✓ Sequence numbers: ${sequences.join(", ")}`);

if (sequences.length === 4 && sequences[0] === 0 && sequences[3] === 3) {
  console.log("✓ Sequence numbers are correct");
} else {
  console.error("✗ Sequence numbers are incorrect");
}

// Test 3: Verify cleanup
unsubscribe();
const count = streamEventBus.getSubscriberCount("test_task_1");
console.log(`✓ Subscriber count after unsubscribe: ${count}`);

if (count === 0) {
  console.log("✓ Cleanup successful");
} else {
  console.error("✗ Cleanup failed");
}

console.log("\n✅ All tests passed!");
