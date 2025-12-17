/**
 * Core message types shared between client and server.
 * These types define the protocol used for WebSocket communication in Verani.
 */

/**
 * Proper type for raw WebSocket data.
 * Represents all possible data types that can be received from a WebSocket.
 */
export type WebSocketRawData = string | ArrayBuffer | ArrayBufferView;

/**
 * Base message frame structure used for all WebSocket communication.
 * All messages sent over WebSocket follow this structure.
 *
 * @template TData - Type of the data payload (defaults to unknown for type safety)
 */
export interface MessageFrame<TData = unknown> {
  type: string;
  channel?: string;
  data?: TData;
}

/**
 * Backward-compatible alias for MessageFrame with unknown data.
 * Use this when you need to explicitly indicate untyped data.
 */
export type UntypedMessageFrame = MessageFrame<unknown>;

/**
 * Message sent from client to server.
 * Extends MessageFrame with no additional fields, but semantically represents client-originated messages.
 *
 * @template TData - Type of the data payload (defaults to unknown for type safety)
 */
export interface ClientMessage<TData = unknown> extends MessageFrame<TData> {}

/**
 * Message sent from server to client.
 * Extends MessageFrame with no additional fields, but semantically represents server-originated messages.
 *
 * @template TData - Type of the data payload (defaults to unknown for type safety)
 */
export interface ServerMessage<TData = unknown> extends MessageFrame<TData> {}

/**
 * Connection metadata attached to each WebSocket.
 * This metadata is stored as a WebSocket attachment and survives actor hibernation.
 * It identifies the user, client, and channels the connection is subscribed to.
 */
export interface ConnectionMeta {
  userId: string;
  clientId: string;
  channels: string[];
}

/**
 * Unified message type for both directions.
 * Represents any message that can be sent over the Verani WebSocket protocol.
 */
export type VeraniMessage = ClientMessage | ServerMessage;

/**
 * Protocol version for future compatibility.
 * Used to identify the protocol version for potential future protocol upgrades.
 */
export const PROTOCOL_VERSION = "1.0.0";

