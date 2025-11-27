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
}

/**
 * Internal fully-resolved client options
 */
interface ResolvedClientOptions {
  reconnection: ReconnectionConfig;
  maxQueueSize: number;
  connectionTimeout: number;
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
      connectionTimeout: options.connectionTimeout ?? 10000
    };

    this.connectionManager = new ConnectionManager(
      url,
      this.options.reconnection,
      (state) => {
        this.onStateChangeCallback?.(state);
      }
    );

    // Start initial connection
    this.connect();
  }

  /**
   * Establishes WebSocket connection
   */
  private connect(): void {
    console.debug("[Verani:Client] Connecting to:", this.url);
    try {
      this.connectionManager.setState("connecting");
      this.ws = new WebSocket(this.url);

      // Setup connection timeout
      const timeout = setTimeout(() => {
        if (this.connectionManager.getState() === "connecting") {
          this.ws?.close();
          this.handleConnectionError(new Error("Connection timeout"));
        }
      }, this.options.connectionTimeout);

      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        this.handleOpen();
      });

      this.ws.addEventListener("message", (ev: MessageEvent) => {
        this.handleMessage(ev);
      });

      this.ws.addEventListener("close", (ev: CloseEvent) => {
        clearTimeout(timeout);
        this.handleClose(ev);
      });

      this.ws.addEventListener("error", (ev: Event) => {
        clearTimeout(timeout);
        this.handleError(ev);
      });
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Handles successful WebSocket connection
   */
  private handleOpen(): void {
    console.debug("[Verani:Client] Connection opened");
    this.connectionManager.setState("connected");
    this.connectionManager.resetReconnection();

    // Flush queued messages
    this.flushMessageQueue();

    // Resolve connection promise
    if (this.connectionResolve) {
      this.connectionResolve();
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Call user callback
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

    const set = this.listeners.get(msg.type);
    if (set) {
      console.debug("[Verani:Client] Dispatching to", set.size, "listeners");

      for (const fn of set) {
        try {
          fn(msg.data);
        } catch (error) {
          console.error("[Verani] Error in message handler:", error);
        }
      }
    } else {
      console.debug("[Verani:Client] No listeners for message type:", msg.type);
    }
  }

  /**
   * Handles WebSocket closure
   */
  private handleClose(event: CloseEvent): void {
    console.debug("[Verani:Client] Connection closed, code:", event.code, "reason:", event.reason);
    this.connectionManager.setState("disconnected");

    // Reject connection promise if pending
    if (this.connectionReject) {
      this.connectionReject(new Error(`Connection closed: ${event.reason || "Unknown reason"}`));
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Call user callback
    this.onCloseCallback?.(event);

    // Attempt reconnection if not a clean close
    if (event.code !== 1000 && event.code !== 1001) {
      this.connectionManager.scheduleReconnect(() => this.connect());
    }
  }

  /**
   * Handles WebSocket errors
   */
  private handleError(error: Event): void {
    console.debug("[Verani:Client] WebSocket error event");
    console.error("[Verani] WebSocket error:", error);
    this.onErrorCallback?.(error);
  }

  /**
   * Handles connection errors
   */
  private handleConnectionError(error: Error): void {
    console.error("[Verani] Connection error:", error);

    // Reject connection promise if pending
    if (this.connectionReject) {
      this.connectionReject(error);
      this.connectionPromise = undefined;
      this.connectionResolve = undefined;
      this.connectionReject = undefined;
    }

    // Attempt reconnection
    this.connectionManager.scheduleReconnect(() => this.connect());
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
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Waits for the connection to be established
   * @returns Promise that resolves when connected
   */
  waitForConnection(): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    if (!this.connectionPromise) {
      this.connectionPromise = new Promise<void>((resolve, reject) => {
        this.connectionResolve = resolve;
        this.connectionReject = reject;
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
    this.disconnect();
    this.connect();
  }

  /**
   * Closes the connection without reconnecting
   */
  disconnect(): void {
    console.debug("[Verani:Client] Disconnecting");
    this.connectionManager.cancelReconnect();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = undefined;
    }
  }

  /**
   * Closes the connection and cleans up resources
   */
  close(): void {
    this.disconnect();
    this.listeners.clear();
    this.messageQueue = [];
    this.connectionManager.destroy();
  }
}
