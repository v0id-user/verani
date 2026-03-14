import type { MessageFrame, WebSocketRawData } from "./types";

/**
 * Validates that a parsed object is a valid MessageFrame.
 * Checks that the object has a required "type" string property and optional "channel" string property.
 *
 * @param obj - The object to validate
 * @returns True if the object is a valid MessageFrame, false otherwise
 */
function isValidFrame(obj: unknown): obj is MessageFrame {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "type" in obj &&
    typeof (obj as Record<string, unknown>).type === "string" &&
    (!("channel" in obj) || typeof (obj as Record<string, unknown>).channel === "string")
  );
}

/**
 * Decodes a raw message into a MessageFrame.
 * This is the core decoding function used by both client and server.
 * Handles JSON parsing and validates the resulting object structure.
 *
 * @param raw - Raw data from WebSocket (string, ArrayBuffer, etc)
 * @returns Decoded MessageFrame or null if parsing or validation fails
 */
export function decodeFrame(raw: WebSocketRawData): MessageFrame | null {
  try {
    const str = typeof raw === "string" ? raw : raw.toString();
    const parsed: unknown = JSON.parse(str);

    if (!isValidFrame(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Decodes a client message.
 * Alias for decodeFrame, provided for semantic clarity when decoding client messages.
 *
 * @param raw - Raw data from client WebSocket
 * @returns Decoded message or null if invalid
 */
export function decodeClientMessage(raw: WebSocketRawData): MessageFrame | null {
  return decodeFrame(raw);
}

/**
 * Decodes a server message.
 * Alias for decodeFrame, provided for semantic clarity when decoding server messages.
 *
 * @param raw - Raw data from server WebSocket
 * @returns Decoded message or null if invalid
 */
export function decodeServerMessage(raw: WebSocketRawData): MessageFrame | null {
  return decodeFrame(raw);
}
