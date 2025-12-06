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
  RpcBroadcastOptions,
  VeraniActor,
  RoomContext,
  MessageContext,
  RoomDefinition,
  ActorStub
} from "./actor/types";

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
