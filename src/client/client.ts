import { encodeClientMessage } from "./protocol";
import { ConnectionManager } from "./connection";
import type { ConnectionState } from "./connection";
import { VeraniClientOptions, resolveClientOptions, type ResolvedClientOptions } from "./runtime/configuration";
import { MessageQueue, type QueuedMessage } from "./runtime/messageQueue";
import { KeepaliveManager } from "./runtime/keepalive";
import { EventEmitter } from "./runtime/eventEmitter";
import { ConnectionHandler, type ConnectionPromiseState } from "./runtime/connection";

// Re-export VeraniClientOptions for backward compatibility
export type { VeraniClientOptions };

/**
 * Verani WebSocket client with automatic reconnection and lifecycle management
 */
export class VeraniClient {
  private connectionHandler: ConnectionHandler;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;
  private keepalive: KeepaliveManager;
  private eventEmitter: EventEmitter;
  private options: ResolvedClientOptions;

  // Lifecycle callbacks
  private onOpenCallback?: () => void;
  private onCloseCallback?: (event: CloseEvent) => void;
  private onErrorCallback?: (error: Event) => void;
  private onStateChangeCallback?: (state: ConnectionState) => void;

  // Connection promise for awaiting connection
  private connectionPromiseState: ConnectionPromiseState = {
    promise: undefined,
    resolve: undefined,
    reject: undefined,
    clear: () => {
      this.connectionPromiseState.promise = undefined;
      this.connectionPromiseState.resolve = undefined;
      this.connectionPromiseState.reject = undefined;
    }
  };

  // Connection state tracking
  private isConnectingRef: { value: boolean };

  /**
   * Creates a new Verani client
   * @param url - WebSocket URL to connect to
   * @param options - Client configuration options
   */
  constructor(private url: string, options: VeraniClientOptions = {}) {
    this.options = resolveClientOptions(options);

    this.connectionManager = new ConnectionManager(
      this.options.reconnection,
      (state) => {
        this.onStateChangeCallback?.(state);
      }
    );

    this.messageQueue = new MessageQueue(this.options.maxQueueSize);
    this.eventEmitter = new EventEmitter();

    // Create a ref object that both ConnectionHandler and VeraniClient can access
    this.isConnectingRef = { value: false };

    this.keepalive = new KeepaliveManager(
      this.options,
      () => this.connectionHandler.getWebSocket(),
      () => {
        const ws = this.connectionHandler.getWebSocket();
        if (ws) {
          ws.close(1006, "Pong timeout");
        }
      }
    );

    this.connectionHandler = new ConnectionHandler(
      this.url,
      this.options,
      this.connectionManager,
      this.keepalive,
      this.eventEmitter,
      this.messageQueue,
      this.connectionPromiseState,
      this.isConnectingRef,
      () => this.isConnected(),
      this.onOpenCallback,
      this.onCloseCallback,
      this.onErrorCallback
    );

    // Expose isConnecting as a property that reads from the ref
    Object.defineProperty(this, "isConnecting", {
      get: () => this.isConnectingRef.value,
      enumerable: true,
      configurable: true
    });

    // Start initial connection
    this.connect();
  }

  /**
   * Establishes WebSocket connection
   */
  private connect(): void {
    this.connectionHandler.connect();
  }

  /**
   * Cleans up existing WebSocket connection and resources
   */
  private cleanupWebSocket(): void {
    this.connectionHandler.cleanupWebSocket();
  }

  /**
   * Gets the current connection state
   */
  getState(): ConnectionState {
    return this.connectionManager.getState();
  }

  /**
   * Checks if the client is currently connected
   */
  isConnected(): boolean {
    const ws = this.connectionHandler.getWebSocket();
    return (
      ws?.readyState === WebSocket.OPEN &&
      this.connectionManager.getState() === "connected"
    );
  }

  /**
   * Gets detailed connection information
   */
  getConnectionState(): {
    state: ConnectionState;
    isConnected: boolean;
    isConnecting: boolean;
    reconnectAttempts: number;
    connectionId: number;
  } {
    return {
      state: this.connectionManager.getState(),
      isConnected: this.isConnected(),
      isConnecting: this.isConnectingRef.value,
      reconnectAttempts: this.connectionManager.getReconnectAttempts(),
      connectionId: this.connectionHandler.getConnectionId()
    };
  }

  /**
   * Waits for the connection to be established
   * @returns Promise that resolves when connected
   */
  waitForConnection(): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    // Create a new promise for each connection attempt
    // This ensures each caller gets proper resolution/rejection
    if (!this.connectionPromiseState.promise) {
      this.connectionPromiseState.promise = new Promise<void>((resolve, reject) => {
        this.connectionPromiseState.resolve = resolve;
        this.connectionPromiseState.reject = reject;

        // Add timeout to prevent hanging promises
        const timeout = setTimeout(() => {
          if (this.connectionPromiseState.reject) {
            this.connectionPromiseState.reject(new Error("Connection wait timeout"));
            this.connectionPromiseState.clear();
          }
        }, this.options.connectionTimeout * 2); // Give it more time than connection timeout

        if (this.connectionPromiseState.promise) {
          // Store the timeout so we can clear it on success/failure
          this.connectionPromiseState.promise.finally(() => {
            clearTimeout(timeout);
          });
        }
      });
    }

    return this.connectionPromiseState.promise;
  }

  /**
   * Registers an event listener
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke when event is received
   */
  on(event: string, callback: (data: any) => void): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Removes an event listener
   * @param event - Event type to remove listener from
   * @param callback - Callback function to remove
   */
  off(event: string, callback: (data: any) => void): void {
    this.eventEmitter.off(event, callback);
  }

  /**
   * Registers a one-time event listener
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke once
   */
  once(event: string, callback: (data: any) => void): void {
    this.eventEmitter.once(event, callback);
  }

  /**
   * Sends a message to the server
   * @param type - Message type
   * @param data - Optional message data
   */
  emit(type: string, data?: any): void {
    console.debug("[Verani:Client] Emitting message, type:", type);
    const msg: QueuedMessage = { type, data };

    if (this.isConnected()) {
      const ws = this.connectionHandler.getWebSocket();
      if (ws) {
        try {
          ws.send(encodeClientMessage(msg));
          console.debug("[Verani:Client] Message sent successfully");
        } catch (error) {
          console.error("[Verani] Failed to send message:", error);
          // Queue message if send fails
          this.messageQueue.queueMessage(msg);
        }
      }
    } else {
      // Queue message if not connected
      this.messageQueue.queueMessage(msg);
    }
  }

  /**
   * Registers lifecycle callback for connection open
   */
  onOpen(callback: () => void): void {
    this.onOpenCallback = callback;
  }

  /**
   * Registers lifecycle callback for connection close
   */
  onClose(callback: (event: CloseEvent) => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Registers lifecycle callback for connection error
   */
  onError(callback: (error: Event) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Registers lifecycle callback for state changes
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Manually triggers a reconnection
   */
  reconnect(): void {
    console.debug("[Verani:Client] Manual reconnect triggered");

    // Reset reconnection attempts for manual reconnect
    this.connectionManager.resetReconnection();

    // Cancel any pending reconnection timers
    this.connectionManager.cancelReconnect();

    // Cleanup existing connection without triggering auto-reconnection
    this.cleanupWebSocket();

    // Clear state flags
    this.isConnectingRef.value = false;
    this.connectionManager.setState("disconnected");

    // Start new connection attempt
    this.connect();
  }

  /**
   * Closes the connection without reconnecting
   */
  disconnect(): void {
    console.debug("[Verani:Client] Disconnecting");

    // Cancel any pending reconnection
    this.connectionManager.cancelReconnect();

    // Clear connecting state
    this.isConnectingRef.value = false;

    // Reject any pending connection promises
    if (this.connectionPromiseState.reject) {
      this.connectionPromiseState.reject(new Error("Connection disconnected"));
      this.connectionPromiseState.clear();
    }

    // Cleanup WebSocket connection
    this.cleanupWebSocket();

    // Update state
    this.connectionManager.setState("disconnected");
  }

  /**
   * Closes the connection and cleans up resources
   */
  close(): void {
    // Reject any pending connection promises
    if (this.connectionPromiseState.reject) {
      this.connectionPromiseState.reject(new Error("Client closed"));
      this.connectionPromiseState.clear();
    }

    this.disconnect();
    this.eventEmitter.clear();
    this.messageQueue.clear();
    this.connectionManager.destroy();
  }
}
