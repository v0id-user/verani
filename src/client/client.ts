import { encodeClientMessage, decodeServerMessage } from "./protocol";
import { ConnectionManager, DEFAULT_RECONNECTION_CONFIG } from "./connection";
import type { ConnectionState, ReconnectionConfig } from "./connection";
import type { MessageFrame } from "../shared/types";

/**
 * Message to be sent, queued when connection is not ready
 */
interface QueuedMessage {
  type: string;
  data?: any;
}

/**
 * Client options for configuring the Verani client
 */
export interface VeraniClientOptions {
  /** Reconnection configuration */
  reconnection?: Partial<ReconnectionConfig>;
  /** Maximum number of messages to queue when disconnected */
  maxQueueSize?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Ping interval in milliseconds (0 = disabled, default: 30000) */
  pingInterval?: number;
  /** Pong timeout in milliseconds (default: 10000) */
  pongTimeout?: number;
}

/**
 * Internal fully-resolved client options
 */
interface ResolvedClientOptions {
  reconnection: ReconnectionConfig;
  maxQueueSize: number;
  connectionTimeout: number;
  pingInterval: number;
  pongTimeout: number;
}

/**
 * Verani WebSocket client with automatic reconnection and lifecycle management
 */
export class VeraniClient {
  private ws?: WebSocket;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private connectionManager: ConnectionManager;
  private messageQueue: QueuedMessage[] = [];
  private options: ResolvedClientOptions;

  // Lifecycle callbacks
  private onOpenCallback?: () => void;
  private onCloseCallback?: (event: CloseEvent) => void;
  private onErrorCallback?: (error: Event) => void;
  private onStateChangeCallback?: (state: ConnectionState) => void;

  // Connection promise for awaiting connection
  private connectionPromise?: Promise<void>;
  private connectionResolve?: () => void;
  private connectionReject?: (error: Error) => void;

  // Connection state tracking
  private connectionTimeout?: number;
  private isConnecting = false;
  private connectionId = 0; // Track connection attempts to identify stale connections

  // Ping/pong keepalive state
  private pingInterval?: number;
  private pongTimeout?: number;
  private lastPongReceived = 0;

  /**
   * Creates a new Verani client
   * @param url - WebSocket URL to connect to
   * @param options - Client configuration options
   */
  constructor(private url: string, options: VeraniClientOptions = {}) {
    const reconnectionConfig: ReconnectionConfig = {
      enabled: options.reconnection?.enabled ?? DEFAULT_RECONNECTION_CONFIG.enabled,
      maxAttempts: options.reconnection?.maxAttempts ?? DEFAULT_RECONNECTION_CONFIG.maxAttempts,
      initialDelay: options.reconnection?.initialDelay ?? DEFAULT_RECONNECTION_CONFIG.initialDelay,
      maxDelay: options.reconnection?.maxDelay ?? DEFAULT_RECONNECTION_CONFIG.maxDelay,
      backoffMultiplier: options.reconnection?.backoffMultiplier ?? DEFAULT_RECONNECTION_CONFIG.backoffMultiplier
    };

    this.options = {
      reconnection: reconnectionConfig,
      maxQueueSize: options.maxQueueSize ?? 100,
      connectionTimeout: options.connectionTimeout ?? 10000,
      pingInterval: options.pingInterval ?? 30000,
      pongTimeout: options.pongTimeout ?? 10000
    };

    this.connectionManager = new ConnectionManager(
      this.options.reconnection,
      (state) => {
        this.onStateChangeCallback?.(state);
      }
    );

    // Start initial connection
    this.connect();
  }

  /**
   * Starts the ping interval to keep the connection alive
   */
  private startPingInterval(): void {
    // Don't start if ping is disabled or already running
    if (this.options.pingInterval === 0 || this.pingInterval !== undefined) {
      return;
    }

    console.debug("[Verani:Client] Starting ping interval:", this.options.pingInterval, "ms");
    this.lastPongReceived = Date.now();

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.debug("[Verani:Client] WebSocket not open, stopping ping");
        this.stopPingInterval();
        return;
      }

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > this.options.pongTimeout + this.options.pingInterval) {
        console.warn("[Verani:Client] Pong timeout exceeded, triggering reconnection");
        this.stopPingInterval();
        this.ws.close(1006, "Pong timeout");
        return;
      }

      // Send ping message
      try {
        console.debug("[Verani:Client] Sending ping");
        this.emit("ping", { timestamp: Date.now() });
      } catch (error) {
        console.error("[Verani:Client] Failed to send ping:", error);
      }
    }, this.options.pingInterval) as unknown as number;
  }

  /**
   * Stops the ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval !== undefined) {
      console.debug("[Verani:Client] Stopping ping interval");
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.pongTimeout !== undefined) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  /**
   * Cleans up existing WebSocket connection and resources
   */
  private cleanupWebSocket(): void {
    // Stop ping interval
    this.stopPingInterval();

    // Clear connection timeout
    if (this.connectionTimeout !== undefined) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    // Close and cleanup WebSocket
    if (this.ws) {
      // Store reference and clear instance variable first
      // This prevents event handlers from processing events from old connection
      const oldWs = this.ws;
      this.ws = undefined;

      // Increment connection ID to invalidate all event handlers for this connection
      // Event handlers check connectionId, so they won't process events from old connection

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
   * Establishes WebSocket connection
   */
  private connect(): void {
    // Guard: Prevent concurrent connection attempts
    if (this.isConnecting) {
      console.debug("[Verani:Client] Already connecting, ignoring duplicate connect call");
      return;
    }

    // Guard: Don't reconnect if already connected
    if (this.isConnected()) {
      console.debug("[Verani:Client] Already connected, ignoring connect call");
      return;
    }

    console.debug("[Verani:Client] Connecting to:", this.url);

    // Cleanup any existing WebSocket
    this.cleanupWebSocket();

    try {
      this.isConnecting = true;
      this.connectionId++; // Increment to track this connection attempt
      const currentConnectionId = this.connectionId;

      this.connectionManager.setState("connecting");
      this.emitLifecycleEvent("connecting");
      this.ws = new WebSocket(this.url);

      // Setup connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.isConnecting && this.connectionId === currentConnectionId) {
          console.debug("[Verani:Client] Connection timeout");
          this.ws?.close();
          this.handleConnectionError(new Error("Connection timeout"));
        }
      }, this.options.connectionTimeout) as unknown as number;

      this.ws.addEventListener("open", () => {
        // Only handle if this is still the current connection attempt
        if (this.connectionId === currentConnectionId) {
          this.handleOpen();
        }
      });

      this.ws.addEventListener("message", (ev: MessageEvent) => {
        // Only handle messages from current connection
        if (this.connectionId === currentConnectionId) {
          this.handleMessage(ev);
        }
      });

      this.ws.addEventListener("close", (ev: CloseEvent) => {
        // Only handle close from current connection
        if (this.connectionId === currentConnectionId) {
          this.handleClose(ev);
        }
      });

      this.ws.addEventListener("error", (ev: Event) => {
        // Only handle error from current connection
        if (this.connectionId === currentConnectionId) {
          this.handleError(ev);
        }
      });
    } catch (error) {
      this.isConnecting = false;
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Handles successful WebSocket connection
   */
  private handleOpen(): void {
    console.debug("[Verani:Client] Connection opened");

    // Clear connecting state and timeout
    this.isConnecting = false;
    if (this.connectionTimeout !== undefined) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    this.connectionManager.setState("connected");
    this.connectionManager.resetReconnection();

    // Start ping interval to keep connection alive
    this.startPingInterval();

    // Flush queued messages
    this.flushMessageQueue();

    // Resolve connection promise
    if (this.connectionResolve) {
      this.connectionResolve();
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Emit lifecycle events
    this.emitLifecycleEvent("open");
    this.emitLifecycleEvent("connected");

    // Call user callback (for backward compatibility)
    this.onOpenCallback?.();
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage(ev: MessageEvent): void {
    console.debug("[Verani:Client] Message received, data length:", typeof ev.data === "string" ? ev.data.length : "unknown");
    const msg = decodeServerMessage(ev.data);
    if (!msg) {
      console.debug("[Verani:Client] Failed to decode message");
      return;
    }
    console.debug("[Verani:Client] Decoded message:", { type: msg.type, channel: msg.channel });

    // Handle pong responses to keep connection alive
    if (msg.type === "event" && msg.channel === "pong") {
      console.debug("[Verani:Client] Received pong");
      this.lastPongReceived = Date.now();
      return;
    }

    // Extract the actual event type from wrapped broadcast messages
    let eventType = msg.type;
    let eventData = msg.data;

    if (msg.type === "event" && msg.data && typeof msg.data === "object" && "type" in msg.data) {
      // This is a wrapped broadcast message - extract the real event type
      eventType = msg.data.type;
      eventData = msg.data;
      console.debug("[Verani:Client] Unwrapped event type:", eventType);
    }

    const set = this.listeners.get(eventType);
    if (set) {
      console.debug("[Verani:Client] Dispatching to", set.size, "listeners");

      for (const fn of set) {
        try {
          fn(eventData);
        } catch (error) {
          console.error("[Verani] Error in message handler:", error);
        }
      }
    } else {
      console.debug("[Verani:Client] No listeners for message type:", eventType);
    }
  }

  /**
   * Handles WebSocket closure
   */
  private handleClose(event: CloseEvent): void {
    console.debug("[Verani:Client] Connection closed, code:", event.code, "reason:", event.reason);

    // Clear connecting state and timeout
    this.isConnecting = false;
    if (this.connectionTimeout !== undefined) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    this.connectionManager.setState("disconnected");

    // Reject connection promise if pending
    if (this.connectionReject) {
      this.connectionReject(new Error(`Connection closed: ${event.reason || "Unknown reason"}`));
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Emit lifecycle events
    this.emitLifecycleEvent("close", event);
    this.emitLifecycleEvent("disconnected", event);

    // Call user callback (for backward compatibility)
    this.onCloseCallback?.(event);

    // Attempt reconnection if not a clean close
    if (event.code !== 1000 && event.code !== 1001) {
      const reconnecting = this.connectionManager.scheduleReconnect(() => this.connect());
      if (reconnecting) {
        this.emitLifecycleEvent("reconnecting");
      }
    }
  }

  /**
   * Handles WebSocket errors
   */
  private handleError(error: Event): void {
    console.debug("[Verani:Client] WebSocket error event");
    console.error("[Verani] WebSocket error:", error);

    // Clear connecting state and timeout
    this.isConnecting = false;
    if (this.connectionTimeout !== undefined) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    // Emit lifecycle event
    this.emitLifecycleEvent("error", error);

    // Call user callback (for backward compatibility)
    this.onErrorCallback?.(error);

    // Consolidate error handling: delegate to handleConnectionError
    this.handleConnectionError(new Error("WebSocket error"));
  }

  /**
   * Handles connection errors
   */
  private handleConnectionError(error: Error): void {
    console.error("[Verani] Connection error:", error);

    // Clear connecting state and timeout
    this.isConnecting = false;
    if (this.connectionTimeout !== undefined) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    // Reject connection promise if pending
    if (this.connectionReject) {
      this.connectionReject(error);
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Emit lifecycle event (only if not already emitted by handleError)
    this.emitLifecycleEvent("error", error);

    // Attempt reconnection
    const reconnecting = this.connectionManager.scheduleReconnect(() => this.connect());
    if (reconnecting) {
      this.emitLifecycleEvent("reconnecting");
    }
  }

  /**
   * Emits a lifecycle event to registered listeners
   */
  private emitLifecycleEvent(event: string, data?: any): void {
    const set = this.listeners.get(event);
    if (set) {
      console.debug("[Verani:Client] Emitting lifecycle event:", event, "to", set.size, "listeners");
      for (const fn of set) {
        try {
          fn(data);
        } catch (error) {
          console.error("[Verani] Error in lifecycle event handler:", error);
        }
      }
    }
  }

  /**
   * Flushes queued messages when connection is established
   */
  private flushMessageQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    console.debug("[Verani:Client] Flushing message queue, count:", this.messageQueue.length);
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      try {
        this.ws.send(encodeClientMessage(msg));
      } catch (error) {
        console.error("[Verani] Failed to send queued message:", error);
      }
    }
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
    return (
      this.ws?.readyState === WebSocket.OPEN &&
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
      isConnecting: this.isConnecting,
      reconnectAttempts: this.connectionManager.getReconnectAttempts(),
      connectionId: this.connectionId
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
    if (!this.connectionPromise) {
      this.connectionPromise = new Promise<void>((resolve, reject) => {
        this.connectionResolve = resolve;
        this.connectionReject = reject;

        // Add timeout to prevent hanging promises
        const timeout = setTimeout(() => {
          if (this.connectionReject) {
            this.connectionReject(new Error("Connection wait timeout"));
            this.connectionPromise = undefined;
            this.connectionResolve = undefined;
            this.connectionReject = undefined;
          }
        }, this.options.connectionTimeout * 2); // Give it more time than connection timeout

				if (this.connectionPromise) {
          // Store the timeout so we can clear it on success/failure
          this.connectionPromise.finally(() => {
            clearTimeout(timeout);
          });
        }
      });
    }

    return this.connectionPromise;
  }

  /**
   * Registers an event listener
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke when event is received
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Removes an event listener
   * @param event - Event type to remove listener from
   * @param callback - Callback function to remove
   */
  off(event: string, callback: (data: any) => void): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Registers a one-time event listener
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke once
   */
  once(event: string, callback: (data: any) => void): void {
    const wrapper = (data: any) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
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
      try {
        this.ws!.send(encodeClientMessage(msg));
        console.debug("[Verani:Client] Message sent successfully");
      } catch (error) {
        console.error("[Verani] Failed to send message:", error);
        // Queue message if send fails
        this.queueMessage(msg);
      }
    } else {
      // Queue message if not connected
      this.queueMessage(msg);
    }
  }

  /**
   * Queues a message for sending when connected
   */
  private queueMessage(msg: QueuedMessage): void {
    console.debug("[Verani:Client] Queuing message, type:", msg.type, "queue size:", this.messageQueue.length);
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      console.warn("[Verani] Message queue full, dropping oldest message");
      this.messageQueue.shift();
    }
    this.messageQueue.push(msg);
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
    this.isConnecting = false;
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
    this.isConnecting = false;

    // Reject any pending connection promises
    if (this.connectionReject) {
      this.connectionReject(new Error("Connection disconnected"));
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
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
    if (this.connectionReject) {
      this.connectionReject(new Error("Client closed"));
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    this.disconnect();
    this.listeners.clear();
    this.messageQueue = [];
    this.connectionManager.destroy();
  }
}
