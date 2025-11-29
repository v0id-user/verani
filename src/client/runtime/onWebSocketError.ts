import type { ConnectionManager } from "../connection";
import type { EventEmitter } from "./eventEmitter";

/**
 * Handles WebSocket errors
 */
export function handleWebSocketError(
  error: Event,
  connectionTimeout: { value: number | undefined; clear: () => void },
  eventEmitter: EventEmitter,
  handleConnectionErrorFn: (error: Error) => void,
  isConnectingRef?: { value: boolean },
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
 * Handles connection errors
 */
export function handleConnectionError(
  error: Error,
  connectionTimeout: { value: number | undefined; clear: () => void },
  connectionPromise: {
    reject?: (error: Error) => void;
    clear: () => void;
  },
  connectionManager: ConnectionManager,
  eventEmitter: EventEmitter,
  connectFn: () => void,
  isConnectingRef?: { value: boolean }
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

