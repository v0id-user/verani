import { encodeClientMessage } from "../protocol";
import type { ResolvedClientOptions } from "./configuration";
import { onVisibilityChange } from "./browserVisibility";

/**
 * Manages ping/pong keepalive for WebSocket connections.
 * Sends periodic ping messages and monitors pong responses to detect connection failures.
 * Automatically resyncs ping interval when the browser tab becomes visible.
 */
export class KeepaliveManager {
  private pingInterval?: number;
  private lastPongReceived = 0;
  private visibilityCleanup?: (() => void) | null;

  constructor(
    private options: ResolvedClientOptions,
    private getWebSocket: () => WebSocket | undefined
  ) {}

  /**
   * Starts the ping interval to keep the connection alive.
   * Sends ping messages at the configured interval and monitors for pong responses.
   * Sets up a visibility change listener to resync ping when the page becomes visible.
   * Does nothing if ping is disabled (pingInterval === 0) or already running.
   */
  startPingInterval(): void {
    if (this.options.pingInterval === 0 || this.pingInterval !== undefined) {
      return;
    }

    this.lastPongReceived = Date.now();

    this.visibilityCleanup = onVisibilityChange((isVisible) => {
      if (isVisible) {
        this.resyncPingInterval();
      }
    });

    this.pingInterval = setInterval(this.createPingInterval(), this.options.pingInterval) as unknown as number;
  }

  /**
   * Creates the ping interval callback function.
   * Checks connection state, monitors pong responses, and sends ping messages.
   */
  private createPingInterval(): () => void {
    return () => {
      const ws = this.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        this.stopPingInterval();
        return;
      }

      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > this.options.pongTimeout + this.options.pingInterval) {
        console.warn("[Verani:Client] Pong timeout exceeded, triggering reconnection");
        this.stopPingInterval();
        ws.close(1006, "Pong timeout");
        return;
      }

      try {
        ws.send(encodeClientMessage({ type: "ping" }));
      } catch (error) {
        console.error("[Verani:Client] Failed to send ping:", error);
      }
    };
  }

  /**
   * Resyncs the ping interval by stopping and restarting it.
   * Also sends an immediate ping to check connection health.
   * This is typically called when the browser tab becomes visible after being hidden.
   * Does nothing if the WebSocket is not in OPEN state.
   */
  resyncPingInterval(): void {
    const ws = this.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    try {
      ws.send(encodeClientMessage({ type: "ping" }));
    } catch (error) {
      console.error("[Verani:Client] Failed to send immediate ping:", error);
    }

    this.lastPongReceived = Date.now();
    this.pingInterval = setInterval(this.createPingInterval(), this.options.pingInterval) as unknown as number;
  }

  /**
   * Stops the ping interval and cleans up resources.
   * Clears the ping interval timer and visibility change listener.
   * Should be called when the connection is closed or during cleanup.
   */
  stopPingInterval(): void {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.visibilityCleanup) {
      this.visibilityCleanup();
      this.visibilityCleanup = undefined;
    }
  }

  /**
   * Records that a pong was received.
   * Updates the timestamp used to detect pong timeouts.
   * Should be called whenever a pong message is received from the server.
   */
  recordPong(): void {
    this.lastPongReceived = Date.now();
  }
}

