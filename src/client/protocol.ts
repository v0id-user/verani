/**
 * Client-side protocol utilities
 * Re-exports from shared protocol modules for backwards compatibility
 */

import { encodeFrame, encodeClientMessage as sharedEncodeClientMessage } from "../shared/encode";
import { decodeFrame, decodeServerMessage as sharedDecodeServerMessage } from "../shared/decode";
import type { ClientMessage, ServerMessage, MessageFrame } from "../shared/types";

export type { ClientMessage, ServerMessage, MessageFrame };

/**
 * Encodes a client message to send to the server
 * @param msg - Message to encode
 * @returns JSON string representation
 */
export function encodeClientMessage(msg: ClientMessage): string {
  console.debug("[Verani:Protocol:Client] Encoding message:", { type: msg.type, channel: msg.channel });
  const encoded = sharedEncodeClientMessage(msg);
  console.debug("[Verani:Protocol:Client] Encoded length:", encoded.length);
  return encoded;
}

/**
 * Decodes a server message received from the server
 * @param raw - Raw WebSocket message data
 * @returns Decoded message or null if invalid
 */
export function decodeServerMessage(raw: any): MessageFrame | null {
  console.debug("[Verani:Protocol:Client] Decoding server message, raw length:", typeof raw === "string" ? raw.length : "unknown");
  const decoded = sharedDecodeServerMessage(raw);
  if (decoded) {
    console.debug("[Verani:Protocol:Client] Decoded successfully:", { type: decoded.type, channel: decoded.channel });
  } else {
    console.debug("[Verani:Protocol:Client] Decode failed");
  }
  return decoded;
}

// Re-export shared utilities
export { encodeFrame, decodeFrame };
