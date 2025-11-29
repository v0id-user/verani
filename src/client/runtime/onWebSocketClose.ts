import type { ConnectionManager } from "../connection";
import type { EventEmitter } from "./eventEmitter";

/**
 * Handles WebSocket closure
 */
export function handleWebSocketClose(
  event: CloseEvent,
  connectionTimeout: { value: number | undefined; clear: () => void },
  connectionManager: ConnectionManager,
  connectionPromise: {
    reject?: (error: Error) => void;
    clear: () => void;
  },
  eventEmitter: EventEmitter,
  connectFn: () => void,
  isConnectingRef?: { value: boolean },
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

