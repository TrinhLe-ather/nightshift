/**
 * Stream Event Bus
 *
 * Event bus for streaming task execution updates to clients.
 * Manages task-scoped EventEmitters with automatic cleanup.
 */

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
