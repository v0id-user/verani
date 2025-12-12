/**
 * Core message types shared between client and server.
 * These types define the protocol used for WebSocket communication in Verani.
 */

/**
 * Base message frame structure used for all WebSocket communication.
 * All messages sent over WebSocket follow this structure.
 */
export interface MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

/**
 * Message sent from client to server.
 * Extends MessageFrame with no additional fields, but semantically represents client-originated messages.
 */
export interface ClientMessage extends MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

/**
 * Message sent from server to client.
 * Extends MessageFrame with no additional fields, but semantically represents server-originated messages.
 */
export interface ServerMessage extends MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

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

