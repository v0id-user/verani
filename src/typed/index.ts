/**
 * Verani Typed - Type-Safe WebSocket SDK
 *
 * Provides tRPC-like type safety for Verani WebSocket communication.
 * Define a contract once, get fully typed APIs on both server and client.
 *
 * @example
 * ```typescript
 * // 1. Define the contract (shared between server and client)
 * import { defineContract, payload } from "verani/typed";
 *
 * export const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string }>(),
 *     "user.joined": payload<{ userId: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *   },
 * });
 *
 * // 2. Server: Create typed room
 * import { createTypedRoom } from "verani/typed";
 * import { createActorHandler } from "verani";
 *
 * const room = createTypedRoom(chatContract, {
 *   websocketPath: "/ws/chat",
 *   onConnect(ctx) {
 *     ctx.emit("user.joined", { userId: ctx.meta.userId });
 *   },
 * });
 *
 * room.handle("message.send", (ctx, data) => {
 *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
 * });
 *
 * export default createActorHandler(room.definition);
 *
 * // 3. Client: Create typed client
 * import { createTypedClient } from "verani/typed/client";
 *
 * const client = createTypedClient(chatContract, "wss://...");
 *
 * client.on("chat.message", (data) => {
 *   console.log(`${data.from}: ${data.text}`);
 * });
 *
 * client.emit("message.send", { text: "Hello!" });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Contract Definition
// ============================================================================

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

// ============================================================================
// Type Inference Utilities
// ============================================================================

export type {
  // Event extraction
  InferServerEvents,
  InferClientEvents,
  InferChannels,
  // Event names
  ServerEventNames,
  ClientEventNames,
  AllEventNames,
  // Payload extraction
  ServerPayload,
  ClientPayload,
  ServerPayloadMap,
  ClientPayloadMap,
  // Handler types
  ServerEventHandler,
  ClientEventHandler,
  // Emit types
  TypedServerEmit,
  TypedClientEmit,
  // Listener types
  TypedServerListener,
  TypedClientListener,
} from "./infer";

// ============================================================================
// Server Integration
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

// ============================================================================
// Validation (Optional)
// ============================================================================

export {
  withValidation,
  isValidatedContract,
  validateData,
  getClientValidator,
  getServerValidator,
  getValidationErrorHandler,
  createValidatedHandler,
  createValidatedListener,
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
// Re-exports from core
// ============================================================================

export { createActorHandler } from "../actor/actor-runtime";

export type {
  ConnectionMeta,
  VeraniActor,
  RoomDefinition,
  ActorStub,
} from "../actor/types";

