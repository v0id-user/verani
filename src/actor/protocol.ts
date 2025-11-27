/**
 * Actor-side protocol utilities
 * Re-exports from shared protocol modules for backwards compatibility
 */

import { decodeFrame as sharedDecodeFrame, decodeClientMessage } from "../shared/decode";
import { encodeFrame as sharedEncodeFrame, encodeServerMessage } from "../shared/encode";
import type { MessageFrame } from "../shared/types";

export type { MessageFrame };

/**
 * Decodes a frame received from a client
 * @param raw - Raw WebSocket message data
 * @returns Decoded MessageFrame or a fallback invalid frame
 */
export function decodeFrame(raw: any): MessageFrame {
  console.debug("[Verani:Protocol:Actor] Decoding frame, raw length:", typeof raw === "string" ? raw.length : "unknown");
  const decoded = sharedDecodeFrame(raw);
  if (decoded) {
    console.debug("[Verani:Protocol:Actor] Decoded successfully:", { type: decoded.type, channel: decoded.channel });
  } else {
    console.debug("[Verani:Protocol:Actor] Decode failed, returning invalid frame");
  }
  // Return invalid frame as fallback for backward compatibility
  return decoded ?? { type: "invalid" };
}

/**
 * Encodes a frame to send to a client
 * @param frame - MessageFrame to encode
 * @returns JSON string representation
 */
export function encodeFrame(frame: MessageFrame): string {
  console.debug("[Verani:Protocol:Actor] Encoding frame:", { type: frame.type, channel: frame.channel });
  const encoded = sharedEncodeFrame(frame);
  console.debug("[Verani:Protocol:Actor] Encoded length:", encoded.length);
  return encoded;
}

// Re-export shared utilities
export { decodeClientMessage, encodeServerMessage };
