import { encodeClientMessage } from "../protocol";
import type { ResolvedClientOptions } from "./configuration";
import { onVisibilityChange } from "./browserVisibility";

/**
 * Manages ping/pong keepalive for WebSocket connections
 */
export class KeepaliveManager {
  private pingInterval?: number;
  private pongTimeout?: number;
  private lastPongReceived = 0;
  private visibilityCleanup?: (() => void) | null;

  constructor(
    private options: ResolvedClientOptions,
    private getWebSocket: () => WebSocket | undefined,
    private onTimeout: () => void
  ) {}

  /**
   * Starts the ping interval to keep the connection alive
   */
  startPingInterval(): void {
    // Don't start if ping is disabled or already running
    if (this.options.pingInterval === 0 || this.pingInterval !== undefined) {
      return;
    }

    console.debug("[Verani:Client] Starting ping interval:", this.options.pingInterval, "ms");
    this.lastPongReceived = Date.now();

    // Set up visibility change listener to resync ping when page becomes visible
    this.visibilityCleanup = onVisibilityChange((isVisible) => {
      if (isVisible) {
        console.debug("[Verani:Client] Page became visible, resyncing ping interval");
        this.resyncPingInterval();
      }
    });

    this.pingInterval = setInterval(() => {
      const ws = this.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.debug("[Verani:Client] WebSocket not open, stopping ping");
        this.stopPingInterval();
        return;
      }

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > this.options.pongTimeout + this.options.pingInterval) {
        console.warn("[Verani:Client] Pong timeout exceeded, triggering reconnection");
        this.stopPingInterval();
        ws.close(1006, "Pong timeout");
        return;
      }

      // Send protocol-encoded ping message
      try {
        console.debug("[Verani:Client] Sending protocol-encoded ping");
        ws.send(encodeClientMessage({ type: "ping" }));
      } catch (error) {
        console.error("[Verani:Client] Failed to send ping:", error);
      }
    }, this.options.pingInterval) as unknown as number;
  }

  /**
   * Resyncs the ping interval by stopping and restarting it
   * Also sends an immediate ping to check connection health
   */
  resyncPingInterval(): void {
    const ws = this.getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.debug("[Verani:Client] WebSocket not open, skipping ping resync");
      return;
    }

    // Stop current interval
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    // Send immediate ping to check connection health
    try {
      console.debug("[Verani:Client] Sending immediate ping after visibility change");
      ws.send(encodeClientMessage({ type: "ping" }));
    } catch (error) {
      console.error("[Verani:Client] Failed to send immediate ping:", error);
    }

    // Restart ping interval with fresh timing
    console.debug("[Verani:Client] Restarting ping interval after resync");
    this.lastPongReceived = Date.now();

    this.pingInterval = setInterval(() => {
      const ws = this.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.debug("[Verani:Client] WebSocket not open, stopping ping");
        this.stopPingInterval();
        return;
      }

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > this.options.pongTimeout + this.options.pingInterval) {
        console.warn("[Verani:Client] Pong timeout exceeded, triggering reconnection");
        this.stopPingInterval();
        ws.close(1006, "Pong timeout");
        return;
      }

      // Send protocol-encoded ping message
      try {
        console.debug("[Verani:Client] Sending protocol-encoded ping");
        ws.send(encodeClientMessage({ type: "ping" }));
      } catch (error) {
        console.error("[Verani:Client] Failed to send ping:", error);
      }
    }, this.options.pingInterval) as unknown as number;
  }

  /**
   * Stops the ping interval
   */
  stopPingInterval(): void {
    if (this.pingInterval !== undefined) {
      console.debug("[Verani:Client] Stopping ping interval");
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.pongTimeout !== undefined) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }

    // Clean up visibility change listener
    if (this.visibilityCleanup) {
      this.visibilityCleanup();
      this.visibilityCleanup = undefined;
    }
  }

  /**
   * Records that a pong was received
   */
  recordPong(): void {
    this.lastPongReceived = Date.now();
  }
}

