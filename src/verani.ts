/**
 * Verani - Realtime SDK for Cloudflare Actors
 *
 * A simple, focused realtime SDK that provides Socket.io-like semantics
 * for Cloudflare Durable Objects / Actors with proper hibernation support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Backend exports - Actor/Room definitions
// ============================================================================

export { defineRoom } from "./actor/router";
export { createActorHandler } from "./actor/actor-runtime";
export { storeAttachment, restoreSessions } from "./actor/attachment";

// Backend types
export type {
  ConnectionMeta,
  MessageFrame,
  BroadcastOptions,
  VeraniActor,
  RoomContext,
  MessageContext,
  RoomDefinition
} from "./actor/types";

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

// ============================================================================
// Utilities
// ============================================================================

export { parseJWT } from "./actor/router";

