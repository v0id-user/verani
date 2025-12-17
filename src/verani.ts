/**
 * Verani - Realtime SDK for Cloudflare Actors
 *
 * A simple, focused realtime SDK that provides Socket.io-like semantics
 * for Cloudflare Durable Objects / Actors with proper hibernation support.
 *
 * @packageDocumentation
 */

// ============================================================================
// New Architecture - Per-Connection DOs (Recommended)
// ============================================================================

// Connection handler (one WebSocket per DO)
export {
  createConnectionHandler,
  defineConnection
} from "./actor/connection-actor";

export type {
  ConnectionDefinition,
  ConnectionContext,
  ConnectionHandlerClass,
  ConnectionDefinitionWithHandlers
} from "./actor/connection-actor";

// Room coordinator (manages membership and broadcasts via RPC)
export {
  createRoomHandler
} from "./actor/room-actor";

export type {
  RoomActorStub,
  RoomHandlerClass
} from "./actor/room-actor";

// New architecture types
export type {
  RoomMember,
  RoomCoordinatorDefinition,
  ConnectionActorStub,
  ConnectionActor,
  ConnectionEmit,
  AsyncEmitBuilder,
  VeraniEnv
} from "./actor/types";

// ============================================================================
// Legacy Architecture - Global Router (Deprecated)
// ============================================================================

/** @deprecated Use createConnectionHandler instead */
export { defineRoom } from "./actor/router";

/** @deprecated Use createConnectionHandler instead */
export { createActorHandler } from "./actor/actor-runtime";

export { storeAttachment, restoreSessions } from "./actor/attachment";

// Legacy types (kept for backward compatibility)
export type {
  ConnectionMeta,
  MessageFrame,
  BroadcastOptions,
  RpcBroadcastOptions,
  /** @deprecated Use ConnectionActor instead */
  VeraniActor,
  RoomContext,
  MessageContext,
  RoomDefinition,
  /** @deprecated Use ConnectionActorStub instead */
  ActorStub
} from "./actor/types";

/** @deprecated Use ConnectionHandlerClass instead */
export type {
  ActorHandlerClass
} from "./actor/actor-runtime";

// ============================================================================
// State Persistence - Safe wrapper for @Persist decorator
// ============================================================================

export {
  // Initialization and helpers
  initializePersistedState,
  isStateReady,
  getPersistedState,
  setPeristErrorHandler,
  persistKey,
  deletePersistedKey,
  getPersistedKeys,
  clearPersistedState,
  // Serialization utilities
  safeSerialize,
  safeDeserialize,
  // Error classes
  PersistNotReadyError,
  PersistError
} from "./actor/persist";

export type {
  SafePersistOptions,
  PersistableActor
} from "./actor/persist";

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
