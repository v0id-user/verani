import type { ConnectionManager } from "../connection";
import type { KeepaliveManager } from "./keepalive";
import type { MessageQueue } from "./messageQueue";
import type { EventEmitter } from "./eventEmitter";
import type { ConnectionTimeoutState, ConnectionPromiseState } from "../types";

/**
 * Handles successful WebSocket connection.
 * Clears connection timeout, updates connection state, starts keepalive ping,
 * flushes queued messages, resolves connection promise, and emits lifecycle events.
 *
 * @param connectionTimeout - Connection timeout state to clear
 * @param connectionManager - Connection manager to update state
 * @param keepalive - Keepalive manager to start ping interval
 * @param messageQueue - Message queue to flush
 * @param ws - The WebSocket connection that opened
 * @param connectionPromise - Promise state to resolve
 * @param eventEmitter - Event emitter for lifecycle events
 * @param onOpenCallback - Optional user callback for backward compatibility
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

