import type { ConnectionManager } from "../connection";
import type { EventEmitter } from "./eventEmitter";
import type { ConnectionTimeoutState, PartialConnectionPromiseState, IsConnectingRef } from "../types";

/**
 * Handles WebSocket errors.
 * Clears connection state, emits error lifecycle event, calls user callback,
 * and delegates to handleConnectionError for reconnection logic.
 *
 * @param error - The WebSocket error event
 * @param connectionTimeout - Connection timeout state to clear
 * @param eventEmitter - Event emitter for lifecycle events
 * @param handleConnectionErrorFn - Function to handle connection errors and schedule reconnection
 * @param isConnectingRef - Optional ref to clear connecting flag
 * @param onErrorCallback - Optional user callback for backward compatibility
 */
export function handleWebSocketError(
  error: Event,
  connectionTimeout: ConnectionTimeoutState,
  eventEmitter: EventEmitter,
  handleConnectionErrorFn: (error: Error) => void,
  isConnectingRef?: IsConnectingRef,
  onErrorCallback?: (error: Event) => void
): void {
  console.debug("[Verani:Client] WebSocket error event");
  console.error("[Verani] WebSocket error:", error);

  // Clear connecting state and timeout
  if (isConnectingRef) {
    isConnectingRef.value = false;
  }
  connectionTimeout.clear();

  // Emit lifecycle event
  eventEmitter.emitLifecycleEvent("error", error);

  // Call user callback (for backward compatibility)
  onErrorCallback?.(error);

  // Consolidate error handling: delegate to handleConnectionError
  handleConnectionErrorFn(new Error("WebSocket error"));
}

/**
 * Handles connection errors.
 * Clears connection state, rejects connection promise, emits error lifecycle event,
 * and schedules reconnection if enabled.
 *
 * @param error - The connection error
 * @param connectionTimeout - Connection timeout state to clear
 * @param connectionPromise - Promise state to reject
 * @param connectionManager - Connection manager to schedule reconnection
 * @param eventEmitter - Event emitter for lifecycle events
 * @param connectFn - Function to call for reconnection
 * @param isConnectingRef - Optional ref to clear connecting flag
 */
export function handleConnectionError(
  error: Error,
  connectionTimeout: ConnectionTimeoutState,
  connectionPromise: PartialConnectionPromiseState,
  connectionManager: ConnectionManager,
  eventEmitter: EventEmitter,
  connectFn: () => void,
  isConnectingRef?: IsConnectingRef
): void {
  console.error("[Verani] Connection error:", error);

  // Clear connecting state and timeout
  if (isConnectingRef) {
    isConnectingRef.value = false;
  }
  connectionTimeout.clear();

  // Reject connection promise if pending
  if (connectionPromise.reject) {
    connectionPromise.reject(error);
    connectionPromise.clear();
  }

  // Emit lifecycle event (only if not already emitted by handleError)
  eventEmitter.emitLifecycleEvent("error", error);

  // Attempt reconnection
  const reconnecting = connectionManager.scheduleReconnect(connectFn);
  if (reconnecting) {
    eventEmitter.emitLifecycleEvent("reconnecting");
  }
}

