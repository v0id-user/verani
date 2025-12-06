import type { ConnectionManager } from "../connection";
import type { KeepaliveManager } from "./keepalive";
import type { MessageQueue } from "./messageQueue";
import type { EventEmitter } from "./eventEmitter";
import type { ConnectionTimeoutState, ConnectionPromiseState } from "../types";

/**
 * Handles successful WebSocket connection
 */
export function handleWebSocketOpen(
  connectionTimeout: ConnectionTimeoutState,
  connectionManager: ConnectionManager,
  keepalive: KeepaliveManager,
  messageQueue: MessageQueue,
  ws: WebSocket,
  connectionPromise: ConnectionPromiseState,
  eventEmitter: EventEmitter,
  onOpenCallback?: () => void
): void {
  console.debug("[Verani:Client] Connection opened");

  // Clear connecting state and timeout
  connectionTimeout.clear();

  connectionManager.setState("connected");
  connectionManager.resetReconnection();

  // Start ping interval to keep connection alive
  keepalive.startPingInterval();

  // Flush queued messages
  messageQueue.flushMessageQueue(ws);

  // Resolve connection promise
  if (connectionPromise.resolve) {
    connectionPromise.resolve();
    connectionPromise.clear();
  }

  // Emit lifecycle events
  eventEmitter.emitLifecycleEvent("open");
  eventEmitter.emitLifecycleEvent("connected");

  // Call user callback (for backward compatibility)
  onOpenCallback?.();
}

