import type { MessageFrame } from "./types";

/**
 * Validates that a parsed object is a valid MessageFrame
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
 * Decodes a raw message into a MessageFrame
 * @param raw - Raw data from WebSocket (string, ArrayBuffer, etc)
 * @returns Decoded MessageFrame or null if invalid
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
 * Decodes a client message
 * @param raw - Raw data from client WebSocket
 * @returns Decoded message or null if invalid
 */
export function decodeClientMessage(raw: any): MessageFrame | null {
  return decodeFrame(raw);
}

/**
 * Decodes a server message
 * @param raw - Raw data from server WebSocket
 * @returns Decoded message or null if invalid
 */
export function decodeServerMessage(raw: any): MessageFrame | null {
  return decodeFrame(raw);
}
