import type { ConnectionManager } from "../connection";
import type { EventEmitter } from "./eventEmitter";
import type { ConnectionTimeoutState, PartialConnectionPromiseState, IsConnectingRef } from "../types";

/**
 * Handles WebSocket closure.
 * Clears connection state, rejects connection promise, emits lifecycle events,
 * and schedules reconnection if the close was not clean (code !== 1000 && code !== 1001).
 *
 * @param event - The WebSocket close event
 * @param connectionTimeout - Connection timeout state to clear
 * @param connectionManager - Connection manager to update state and schedule reconnection
 * @param connectionPromise - Promise state to reject
 * @param eventEmitter - Event emitter for lifecycle events
 * @param connectFn - Function to call for reconnection
 * @param isConnectingRef - Optional ref to clear connecting flag
 * @param onCloseCallback - Optional user callback for backward compatibility
 */
export function handleWebSocketClose(
  event: CloseEvent,
  connectionTimeout: ConnectionTimeoutState,
  connectionManager: ConnectionManager,
  connectionPromise: PartialConnectionPromiseState,
  eventEmitter: EventEmitter,
  connectFn: () => void,
  isConnectingRef?: IsConnectingRef,
  onCloseCallback?: (event: CloseEvent) => void
): void {
  console.debug("[Verani:Client] Connection closed, code:", event.code, "reason:", event.reason);

  // Clear connecting state and timeout
  if (isConnectingRef) {
    isConnectingRef.value = false;
  }
  connectionTimeout.clear();

  connectionManager.setState("disconnected");

  // Reject connection promise if pending
  if (connectionPromise.reject) {
    connectionPromise.reject(new Error(`Connection closed: ${event.reason || "Unknown reason"}`));
    connectionPromise.clear();
  }

  // Emit lifecycle events
  eventEmitter.emitLifecycleEvent("close", event);
  eventEmitter.emitLifecycleEvent("disconnected", event);

  // Call user callback (for backward compatibility)
  onCloseCallback?.(event);

  // Attempt reconnection if not a clean close
  if (event.code !== 1000 && event.code !== 1001) {
    const reconnecting = connectionManager.scheduleReconnect(connectFn);
    if (reconnecting) {
      eventEmitter.emitLifecycleEvent("reconnecting");
    }
  }
}

