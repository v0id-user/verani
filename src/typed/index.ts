/**
 * Verani Typed - Server Entry Point
 *
 * ⚠️  SERVER-ONLY: This module contains Cloudflare Workers/Actors dependencies.
 * For client-side code (browsers, React Native, etc.), use "verani/typed/client" instead.
 *
 * This module provides:
 * - `createTypedRoom()` - Type-safe room creation for Cloudflare Actors
 * - `createActorHandler()` - Actor handler for Cloudflare Workers
 * - All shared types (contracts, payloads, validation)
 *
 * @example
 * ```typescript
 * // Server code (Cloudflare Workers)
 * import { defineContract, payload, createTypedRoom, createActorHandler } from "verani/typed";
 *
 * const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *   },
 * });
 *
 * const room = createTypedRoom(chatContract, {
 *   websocketPath: "/ws/chat",
 *   onConnect(ctx) {
 *     ctx.emit("chat.message", { from: "system", text: "Welcome!" });
 *   },
 * });
 *
 * room.on("message.send", (ctx, data) => {
 *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
 * });
 *
 * export const ChatRoom = createActorHandler(room.definition);
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Shared Exports (Safe for both server and client)
// ============================================================================

// Contract Definition
export {
  defineContract,
  payload,
  isContract,
} from "./contract";

export type {
  Contract,
  ContractDefinition,
  EventMap,
  PayloadMarker,
  ExtractPayload,
  EventPayloads,
} from "./contract";

// Type Inference Utilities
export type {
  InferServerEvents,
  InferClientEvents,
  InferChannels,
  ServerEventNames,
  ClientEventNames,
  AllEventNames,
  ServerPayload,
  ClientPayload,
  ServerPayloadMap,
  ClientPayloadMap,
  ServerEventHandler,
  ClientEventHandler,
  TypedServerEmit,
  TypedClientEmit,
  TypedServerListener,
  TypedClientListener,
} from "./infer";

// Validation (shared utilities)
export {
  withValidation,
  isValidatedContract,
  validateData,
} from "./validation";

export type {
  Validator,
  ValidationResult,
  ValidationError,
  ValidationIssue,
  ValidatorMap,
  ValidationConfig,
  ValidatedContract,
} from "./validation";

// ============================================================================
// Server-Only Exports (Cloudflare Workers/Actors)
// ============================================================================

export { createTypedRoom } from "./server";

export type {
  TypedRoom,
  TypedRoomConfig,
  TypedRoomContext,
  TypedMessageContext,
  TypedEventHandler,
  TypedSocketEmit,
  TypedActorEmit,
  TypedEmitBuilder,
} from "./server";

// Server-side validation helpers
export {
  getClientValidator,
  getValidationErrorHandler,
  createValidatedHandler,
} from "./validation";

// ============================================================================
// Re-exports from Verani Core (Cloudflare Workers/Actors)
// ============================================================================

export { createActorHandler } from "../actor/actor-runtime";

export type {
  ConnectionMeta,
  VeraniActor,
  RoomDefinition,
  ActorStub,
} from "../actor/types";
