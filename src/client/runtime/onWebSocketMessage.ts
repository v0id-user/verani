import { decodeServerMessage } from "../protocol";
import type { WebSocketRawData } from "../protocol";
import type { KeepaliveManager } from "./keepalive";
import type { EventEmitter } from "./eventEmitter";

/**
 * Handles incoming WebSocket messages.
 * Decodes the message, handles protocol-level pong responses for keepalive,
 * and dispatches application events to registered listeners.
 *
 * @param ev - The WebSocket message event
 * @param keepalive - Keepalive manager to record pong responses
 * @param eventEmitter - Event emitter to dispatch events to listeners
 */
export function handleWebSocketMessage(
  ev: MessageEvent,
  keepalive: KeepaliveManager,
  eventEmitter: EventEmitter
): void {
  console.debug("[Verani:Client] Message received, data length:", typeof ev.data === "string" ? ev.data.length : "unknown");

  const msg = decodeServerMessage(ev.data as WebSocketRawData);
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
  let eventType: string = msg.type;
  let eventData: unknown = msg.data;

  // Check if this is a wrapped broadcast message with nested type
  const msgData = msg.data as Record<string, unknown> | undefined;
  if (msg.type === "event" && msgData && typeof msgData === "object" && "type" in msgData) {
    // This is a wrapped broadcast message - extract the real event type
    eventType = msgData.type as string;
    eventData = msgData;
    console.debug("[Verani:Client] Unwrapped event type:", eventType);
  }

  eventEmitter.dispatch(eventType, eventData);
}

