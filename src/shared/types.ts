/**
 * Core message types shared between client and server
 */

/**
 * Base message frame structure used for all WebSocket communication
 */
export interface MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

/**
 * Message sent from client to server
 */
export interface ClientMessage extends MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

/**
 * Message sent from server to client
 */
export interface ServerMessage extends MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}

/**
 * Connection metadata attached to each WebSocket
 */
export interface ConnectionMeta {
  userId: string;
  clientId: string;
  channels: string[];
}

/**
 * Unified message type for both directions
 */
export type VeraniMessage = ClientMessage | ServerMessage;

/**
 * Protocol version for future compatibility
 */
export const PROTOCOL_VERSION = "1.0.0";

