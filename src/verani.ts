/**
 * Verani - Realtime SDK for Cloudflare Actors
 *
 * A simple, focused realtime SDK that provides Socket.io-like semantics
 * for Cloudflare Durable Objects / Actors with proper hibernation support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Per-Connection Architecture
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

// Architecture types
export type {
  RoomMember,
  RoomCoordinatorDefinition,
  ConnectionActorStub,
  ConnectionActor,
  ConnectionEmit,
  AsyncEmitBuilder,
  VeraniEnv,
  ConnectionMeta,
  MessageFrame,
  BroadcastOptions,
  RpcBroadcastOptions,
  RoomEmitOptions
} from "./actor/types";

// Attachment utilities
export { storeAttachment } from "./actor/attachment";

// Debug utility
export { enableDebug } from "./actor/debug";

// ============================================================================
// State Persistence - Safe wrapper for @Persist decorator
// ============================================================================

export {
  // Initialization and helpers
  initializePersistedState,
  isStateReady,
  getPersistedState,
  setPersistErrorHandler,
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
