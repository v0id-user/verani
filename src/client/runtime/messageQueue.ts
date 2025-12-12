import { encodeClientMessage } from "../protocol";

/**
 * Message to be sent, queued when connection is not ready.
 * Messages are automatically flushed when the connection is established.
 */
export interface QueuedMessage {
  type: string;
  data?: any;
}

/**
 * Manages message queueing for when connection is not ready.
 * Messages are queued when the client is disconnected and automatically sent
 * when the connection is established. If the queue reaches maxQueueSize, oldest messages are dropped.
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];

  constructor(private maxQueueSize: number) {}

  /**
   * Queues a message for sending when connected.
   * If the queue is full, the oldest message is dropped to make room.
   *
   * @param msg - Message to queue
   */
  queueMessage(msg: QueuedMessage): void {
    console.debug("[Verani:Client] Queuing message, type:", msg.type, "queue size:", this.queue.length);
    if (this.queue.length >= this.maxQueueSize) {
      console.warn("[Verani] Message queue full, dropping oldest message");
      this.queue.shift();
    }
    this.queue.push(msg);
  }

  /**
   * Flushes queued messages when connection is established.
   * Sends all queued messages in order and clears the queue.
   * Only sends if the WebSocket is in OPEN state.
   *
   * @param ws - The WebSocket connection to send messages through
   */
  flushMessageQueue(ws: WebSocket): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    console.debug("[Verani:Client] Flushing message queue, count:", this.queue.length);
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      try {
        ws.send(encodeClientMessage(msg));
      } catch (error) {
        console.error("[Verani] Failed to send queued message:", error);
      }
    }
  }

  /**
   * Clears the message queue, discarding all queued messages.
   * Should be called during cleanup or when explicitly canceling queued messages.
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Gets the current queue length.
   *
   * @returns The number of messages currently queued
   */
  getLength(): number {
    return this.queue.length;
  }
}

