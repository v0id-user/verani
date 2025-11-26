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
  const decoded = sharedDecodeFrame(raw);
  // Return invalid frame as fallback for backward compatibility
  return decoded ?? { type: "invalid" };
}

/**
 * Encodes a frame to send to a client
 * @param frame - MessageFrame to encode
 * @returns JSON string representation
 */
export function encodeFrame(frame: MessageFrame): string {
  return sharedEncodeFrame(frame);
}

// Re-export shared utilities
export { decodeClientMessage, encodeServerMessage };
