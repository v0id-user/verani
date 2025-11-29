import { encodeClientMessage } from "../protocol";

/**
 * Message to be sent, queued when connection is not ready
 */
export interface QueuedMessage {
  type: string;
  data?: any;
}

/**
 * Manages message queueing for when connection is not ready
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];

  constructor(private maxQueueSize: number) {}

  /**
   * Queues a message for sending when connected
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
   * Flushes queued messages when connection is established
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
   * Clears the message queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Gets the current queue length
   */
  getLength(): number {
    return this.queue.length;
  }
}

