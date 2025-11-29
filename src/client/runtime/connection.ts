import type { ConnectionManager } from "../connection";
import type { EventEmitter } from "./eventEmitter";
import type { KeepaliveManager } from "./keepalive";
import { handleWebSocketOpen } from "./onWebSocketOpen";
import { handleWebSocketMessage } from "./onWebSocketMessage";
import { handleWebSocketClose } from "./onWebSocketClose";
import { handleWebSocketError, handleConnectionError } from "./onWebSocketError";
import type { ResolvedClientOptions } from "./configuration";

/**
 * Connection promise state
 */
export interface ConnectionPromiseState {
  promise?: Promise<void>;
  resolve?: () => void;
  reject?: (error: Error) => void;
  clear(): void;
}

/**
 * Connection timeout state
 */
export interface ConnectionTimeoutState {
  value: number | undefined;
  clear(): void;
}

/**
 * Handles WebSocket connection establishment and cleanup
 */
export class ConnectionHandler {
  private ws?: WebSocket;
  private connectionId = 0;
  private connectionTimeoutState: ConnectionTimeoutState = {
    value: undefined,
    clear: () => {
      if (this.connectionTimeoutState.value !== undefined) {
        clearTimeout(this.connectionTimeoutState.value);
        this.connectionTimeoutState.value = undefined;
      }
    }
  };

  constructor(
    private url: string,
    private options: ResolvedClientOptions,
    private connectionManager: ConnectionManager,
    private keepalive: KeepaliveManager,
    private eventEmitter: EventEmitter,
    private messageQueue: any,
    private connectionPromise: ConnectionPromiseState,
    private isConnectingRef: { value: boolean },
    private isConnectedFn: () => boolean,
    private onOpenCallback?: () => void,
    private onCloseCallback?: (event: CloseEvent) => void,
    private onErrorCallback?: (error: Event) => void
  ) {}

  /**
   * Establishes WebSocket connection
   */
  connect(): void {
    // Guard: Prevent concurrent connection attempts
    if (this.isConnectingRef.value) {
      console.debug("[Verani:Client] Already connecting, ignoring duplicate connect call");
      return;
    }

    // Guard: Don't reconnect if already connected
    if (this.isConnectedFn()) {
      console.debug("[Verani:Client] Already connected, ignoring connect call");
      return;
    }

    console.debug("[Verani:Client] Connecting to:", this.url);

    // Cleanup any existing WebSocket
    this.cleanupWebSocket();

    try {
      this.isConnectingRef.value = true;
      this.connectionId++; // Increment to track this connection attempt
      const currentConnectionId = this.connectionId;

      this.connectionManager.setState("connecting");
      this.eventEmitter.emitLifecycleEvent("connecting");
      this.ws = new WebSocket(this.url);

      // Setup connection timeout
      this.connectionTimeoutState.value = setTimeout(() => {
        if (this.isConnectingRef.value && this.connectionId === currentConnectionId) {
          console.debug("[Verani:Client] Connection timeout");
          this.ws?.close();
          this.handleConnectionErrorInternal(new Error("Connection timeout"));
        }
      }, this.options.connectionTimeout) as unknown as number;

      this.ws.addEventListener("open", () => {
        // Only handle if this is still the current connection attempt
        if (this.connectionId === currentConnectionId) {
          this.handleOpenInternal();
        }
      });

      this.ws.addEventListener("message", (ev: MessageEvent) => {
        // Only handle messages from current connection
        if (this.connectionId === currentConnectionId) {
          handleWebSocketMessage(ev, this.keepalive, this.eventEmitter);
        }
      });

      this.ws.addEventListener("close", (ev: CloseEvent) => {
        // Only handle close from current connection
        if (this.connectionId === currentConnectionId) {
          handleWebSocketClose(
            ev,
            this.connectionTimeoutState,
            this.connectionManager,
            this.connectionPromise,
            this.eventEmitter,
            () => this.connect(),
            this.isConnectingRef,
            this.onCloseCallback
          );
        }
      });

      this.ws.addEventListener("error", (ev: Event) => {
        // Only handle error from current connection
        if (this.connectionId === currentConnectionId) {
          handleWebSocketError(
            ev,
            this.connectionTimeoutState,
            this.eventEmitter,
            (error: Error) => this.handleConnectionErrorInternal(error),
            this.isConnectingRef,
            this.onErrorCallback
          );
        }
      });
    } catch (error) {
      this.isConnectingRef.value = false;
      this.handleConnectionErrorInternal(error as Error);
    }
  }

  /**
   * Cleans up existing WebSocket connection and resources
   */
  cleanupWebSocket(): void {
    // Stop ping interval
    this.keepalive.stopPingInterval();

    // Clear connection timeout
    this.connectionTimeoutState.clear();

    // Close and cleanup WebSocket
    if (this.ws) {
      // Store reference and clear instance variable first
      // This prevents event handlers from processing events from old connection
      const oldWs = this.ws;
      this.ws = undefined;

      // Close the connection if still open
      if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
        try {
          // Use code 1000 (normal closure) to prevent triggering reconnection
          oldWs.close(1000, "Cleanup");
        } catch (error) {
          console.debug("[Verani:Client] Error closing WebSocket during cleanup:", error);
        }
      }
    }
  }

  /**
   * Gets the current WebSocket instance
   */
  getWebSocket(): WebSocket | undefined {
    return this.ws;
  }

  /**
   * Gets the current connection ID
   */
  getConnectionId(): number {
    return this.connectionId;
  }

  /**
   * Internal handler for connection open
   */
  private handleOpenInternal(): void {
    handleWebSocketOpen(
      this.connectionTimeoutState,
      this.connectionManager,
      this.keepalive,
      this.messageQueue,
      this.ws!,
      this.connectionPromise,
      this.eventEmitter,
      this.onOpenCallback
    );
    this.isConnectingRef.value = false;
  }

  /**
   * Internal handler for connection errors
   */
  private handleConnectionErrorInternal(error: Error): void {
    handleConnectionError(
      error,
      this.connectionTimeoutState,
      this.connectionPromise,
      this.connectionManager,
      this.eventEmitter,
      () => this.connect(),
      this.isConnectingRef
    );
  }
}

