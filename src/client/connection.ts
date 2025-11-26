/**
 * Connection state management for Verani client
 */

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface ReconnectionConfig {
  /** Enable automatic reconnection */
  enabled: boolean;
  /** Maximum number of reconnection attempts (0 = infinite) */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
}

export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  enabled: true,
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 1.5
};

/**
 * Manages WebSocket connection lifecycle and reconnection logic
 */
export class ConnectionManager {
  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private currentDelay: number;
  
  constructor(
    private url: string,
    private config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG,
    private onStateChange?: (state: ConnectionState) => void
  ) {
    this.currentDelay = config.initialDelay;
  }

  /**
   * Gets the current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Updates the connection state and notifies listeners
   */
  setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  /**
   * Resets reconnection state (called on successful connection)
   */
  resetReconnection(): void {
    this.reconnectAttempts = 0;
    this.currentDelay = this.config.initialDelay;
    this.clearReconnectTimer();
  }

  /**
   * Schedules a reconnection attempt
   */
  scheduleReconnect(connectFn: () => void): boolean {
    // Check if we should attempt reconnection
    if (!this.config.enabled) {
      return false;
    }

    if (this.config.maxAttempts > 0 && this.reconnectAttempts >= this.config.maxAttempts) {
      this.setState("error");
      return false;
    }

    // Clear any existing timer
    this.clearReconnectTimer();

    // Schedule reconnection
    this.setState("reconnecting");
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      connectFn();
      
      // Increase delay for next attempt (exponential backoff)
      this.currentDelay = Math.min(
        this.currentDelay * this.config.backoffMultiplier,
        this.config.maxDelay
      );
    }, this.currentDelay) as unknown as number;

    return true;
  }

  /**
   * Cancels any pending reconnection
   */
  cancelReconnect(): void {
    this.clearReconnectTimer();
    if (this.state === "reconnecting") {
      this.setState("disconnected");
    }
  }

  /**
   * Clears the reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Gets the current reconnection attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Gets the next reconnection delay
   */
  getNextDelay(): number {
    return this.currentDelay;
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    this.clearReconnectTimer();
  }
}

