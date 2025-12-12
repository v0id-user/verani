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
 * Manages WebSocket connection lifecycle and reconnection logic.
 * Tracks connection state transitions, schedules reconnection attempts with exponential backoff,
 * and validates state transitions to ensure consistency.
 */
export class ConnectionManager {
  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private currentDelay: number;

  constructor(
    private config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG,
    private onStateChange?: (state: ConnectionState) => void
  ) {
    this.currentDelay = config.initialDelay;
  }

  /**
   * Gets the current connection state.
   *
   * @returns The current connection state ("connecting", "connected", "disconnected", "reconnecting", or "error")
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Validates if a state transition is valid.
   * Ensures that state changes follow a logical flow and prevents invalid transitions.
   *
   * @param from - The current state
   * @param to - The target state
   * @returns True if the transition is valid, false otherwise
   */
  private isValidStateTransition(from: ConnectionState, to: ConnectionState): boolean {
    // Define valid state transitions
    const validTransitions: Record<ConnectionState, ConnectionState[]> = {
      disconnected: ["connecting", "reconnecting"],
      connecting: ["connected", "disconnected", "error", "reconnecting"],
      connected: ["disconnected", "reconnecting"],
      reconnecting: ["connecting", "disconnected", "error"],
      error: ["reconnecting", "disconnected", "connecting"]
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Updates the connection state and notifies listeners.
   * Validates the state transition and logs warnings for invalid transitions.
   * Only triggers callbacks if the state actually changes.
   *
   * @param newState - The new connection state to transition to
   */
  setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      // Validate state transition
      if (!this.isValidStateTransition(this.state, newState)) {
        console.warn(
          "[Verani:Connection] Invalid state transition:",
          this.state,
          "->",
          newState
        );
      }

      console.debug("[Verani:Connection] State change:", this.state, "->", newState);
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  /**
   * Resets reconnection state (called on successful connection).
   * Clears the reconnection attempt counter and resets the delay to the initial value.
   * Also cancels any pending reconnection timers.
   */
  resetReconnection(): void {
    console.debug("[Verani:Connection] Resetting reconnection state");
    this.reconnectAttempts = 0;
    this.currentDelay = this.config.initialDelay;
    this.clearReconnectTimer();
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   * Checks if reconnection is enabled and if max attempts haven't been reached.
   * Updates the delay for the next attempt using exponential backoff.
   *
   * @param connectFn - Function to call when it's time to reconnect
   * @returns True if reconnection was scheduled, false if reconnection is disabled or max attempts reached
   */
  scheduleReconnect(connectFn: () => void): boolean {
    // Check if we should attempt reconnection
    if (!this.config.enabled) {
      console.debug("[Verani:Connection] Reconnection disabled");
      return false;
    }

    if (this.config.maxAttempts > 0 && this.reconnectAttempts >= this.config.maxAttempts) {
      console.debug("[Verani:Connection] Max reconnection attempts reached:", this.reconnectAttempts);
      this.setState("error");
      return false;
    }

    // Clear any existing timer
    this.clearReconnectTimer();

    // Schedule reconnection
    this.setState("reconnecting");
    this.reconnectAttempts++;
    console.debug("[Verani:Connection] Scheduling reconnect attempt", this.reconnectAttempts, "in", this.currentDelay, "ms");

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
   * Cancels any pending reconnection attempt.
   * Clears the reconnection timer and transitions state from "reconnecting" to "disconnected" if applicable.
   */
  cancelReconnect(): void {
    this.clearReconnectTimer();
    if (this.state === "reconnecting") {
      this.setState("disconnected");
    }
  }

  /**
   * Clears the reconnect timer if one is set.
   * Internal helper method used to clean up pending reconnection attempts.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Gets the current reconnection attempt count.
   *
   * @returns The number of reconnection attempts made so far
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Gets the next reconnection delay in milliseconds.
   * This value increases with each attempt due to exponential backoff.
   *
   * @returns The delay in milliseconds before the next reconnection attempt
   */
  getNextDelay(): number {
    return this.currentDelay;
  }

  /**
   * Cleanup method that clears all timers and resources.
   * Should be called when the ConnectionManager is no longer needed.
   */
  destroy(): void {
    this.clearReconnectTimer();
  }
}

