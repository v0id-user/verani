import type { MessageFrame } from "./types";

/**
 * Encodes a message frame to JSON string for transmission over WebSocket.
 * This is the core encoding function used by both client and server.
 *
 * @param frame - The message frame to encode
 * @returns JSON string representation of the frame
 * @throws Error if JSON serialization fails
 */
export function encodeFrame(frame: MessageFrame): string {
  console.debug("[Verani:Encode] Encoding frame:", { type: frame.type, hasChannel: !!frame.channel, hasData: !!frame.data });
  try {
    const encoded = JSON.stringify(frame);
    console.debug("[Verani:Encode] Encoded successfully, length:", encoded.length);
    return encoded;
  } catch (error) {
    throw new Error(
      `Failed to encode frame: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

/**
 * Encodes a client message to JSON string.
 * Alias for encodeFrame, provided for semantic clarity when encoding client messages.
 *
 * @param message - The client message to encode
 * @returns JSON string representation
 */
export function encodeClientMessage(message: MessageFrame): string {
  return encodeFrame(message);
}

/**
 * Encodes a server message to JSON string.
 * Alias for encodeFrame, provided for semantic clarity when encoding server messages.
 *
 * @param message - The server message to encode
 * @returns JSON string representation
 */
export function encodeServerMessage(message: MessageFrame): string {
  return encodeFrame(message);
}
