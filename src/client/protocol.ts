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
  return sharedEncodeClientMessage(msg);
}

/**
 * Decodes a server message received from the server
 * @param raw - Raw WebSocket message data
 * @returns Decoded message or null if invalid
 */
export function decodeServerMessage(raw: any): MessageFrame | null {
  return sharedDecodeServerMessage(raw);
}

// Re-export shared utilities
export { encodeFrame, decodeFrame };
