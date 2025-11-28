/**
 * Verani Client - WebSocket client for Cloudflare Actors
 *
 * Client-side SDK that provides Socket.io-like semantics for connecting
 * to Verani-powered Cloudflare Actors with automatic reconnection support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Client exports - WebSocket client
// ============================================================================

export { VeraniClient } from "./client/client";
export type { VeraniClientOptions } from "./client/client";

export { ConnectionManager, DEFAULT_RECONNECTION_CONFIG } from "./client/connection";
export type { ConnectionState, ReconnectionConfig } from "./client/connection";

// ============================================================================
// Shared exports - Protocol and types
// ============================================================================

export type {
  ClientMessage,
  ServerMessage,
  VeraniMessage
} from "./shared/types";

export {
  encodeFrame,
  encodeClientMessage,
  encodeServerMessage
} from "./shared/encode";

export {
  decodeFrame,
  decodeClientMessage,
  decodeServerMessage
} from "./shared/decode";

export { PROTOCOL_VERSION } from "./shared/types";

