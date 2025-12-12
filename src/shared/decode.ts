import type { MessageFrame } from "./types";

/**
 * Validates that a parsed object is a valid MessageFrame.
 * Checks that the object has a required "type" string property and optional "channel" string property.
 *
 * @param obj - The object to validate
 * @returns True if the object is a valid MessageFrame, false otherwise
 */
function isValidFrame(obj: any): obj is MessageFrame {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.type === "string" &&
    (obj.channel === undefined || typeof obj.channel === "string")
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
export function decodeFrame(raw: any): MessageFrame | null {
  try {
    console.debug("[Verani:Decode] Decoding raw data");
    const str = typeof raw === "string" ? raw : raw.toString();
    const parsed = JSON.parse(str);

    if (!isValidFrame(parsed)) {
      console.warn("Invalid frame structure:", parsed);
      return null;
    }

    console.debug("[Verani:Decode] Successfully decoded frame:", { type: parsed.type, hasChannel: !!parsed.channel });
    return parsed;
  } catch (error) {
    console.warn("Failed to decode frame:", error);
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
export function decodeClientMessage(raw: any): MessageFrame | null {
  return decodeFrame(raw);
}

/**
 * Decodes a server message.
 * Alias for decodeFrame, provided for semantic clarity when decoding server messages.
 *
 * @param raw - Raw data from server WebSocket
 * @returns Decoded message or null if invalid
 */
export function decodeServerMessage(raw: any): MessageFrame | null {
  return decodeFrame(raw);
}
