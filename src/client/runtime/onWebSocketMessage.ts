import { decodeServerMessage } from "../protocol";
import type { KeepaliveManager } from "./keepalive";
import type { EventEmitter } from "./eventEmitter";

/**
 * Handles incoming WebSocket messages
 */
export function handleWebSocketMessage(
  ev: MessageEvent,
  keepalive: KeepaliveManager,
  eventEmitter: EventEmitter
): void {
  console.debug("[Verani:Client] Message received, data length:", typeof ev.data === "string" ? ev.data.length : "unknown");

  const msg = decodeServerMessage(ev.data);
  if (!msg) {
    console.debug("[Verani:Client] Failed to decode message");
    return;
  }
  console.debug("[Verani:Client] Decoded message:", { type: msg.type, channel: msg.channel });

  // Handle protocol-encoded pong responses to keep connection alive
  if (msg.type === "pong") {
    console.debug("[Verani:Client] Received protocol-encoded pong");
    keepalive.recordPong();
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

  eventEmitter.dispatch(eventType, eventData);
}

