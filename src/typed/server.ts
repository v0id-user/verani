/**
 * Type-Safe Server Integration for Verani
 *
 * Provides createTypedRoom() which wraps defineRoom() with full type safety
 * for event handlers and emit operations based on a contract definition.
 *
 * @example
 * ```typescript
 * const room = createTypedRoom(chatContract, {
 *   websocketPath: "/ws/chat",
 *   extractMeta(req) {
 *     return { userId: "...", clientId: "...", channels: ["default"] };
 *   },
 *   onConnect(ctx) {
 *     ctx.emit("user.joined", { userId: ctx.meta.userId });
 *   },
 * });
 *
 * room.on("message.send", (ctx, data) => {
 *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
 * });
 * ```
 *
 * @packageDocumentation
 */

import { defineRoom } from "../actor/router";
import type {
  RoomDefinition,
  RoomContext as BaseRoomContext,
  MessageContext as BaseMessageContext,
  VeraniActor,
  ConnectionMeta,
} from "../actor/types";
import type { Contract } from "./contract";
import type {
  ServerEventNames,
  ClientEventNames,
  ServerPayload,
  ClientPayload,
  InferChannels,
} from "./infer";
import {
  isValidatedContract,
  getClientValidator,
  validateData,
  getValidationErrorHandler,
} from "./validation";

// ============================================================================
// Typed Context Types
// ============================================================================

/**
 * Typed emit builder for targeting specific scopes.
 */
export interface TypedEmitBuilder<
  C extends Contract,
  TMeta extends ConnectionMeta,
> {
  /**
   * Emit a typed server event to the targeted scope.
   * @param event - Server event name (constrained by contract)
   * @param data - Event payload (type-checked against contract)
   */
  emit<E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): number;
}

/**
 * Typed socket-level emit API.
 * Available on context for emitting to current socket, user, or channel.
 */
export interface TypedSocketEmit<
  C extends Contract,
  TMeta extends ConnectionMeta,
> {
  /**
   * Emit a typed server event to the current socket.
   * @param event - Server event name (constrained by contract)
   * @param data - Event payload (type-checked against contract)
   */
  <E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): void;

  /**
   * Target a specific user or channel for emitting.
   * @param target - User ID or channel name
   */
  to(target: string): TypedEmitBuilder<C, TMeta>;
}

/**
 * Typed actor-level emit API.
 * Available on actor for broadcasting to channels.
 */
export interface TypedActorEmit<
  C extends Contract,
  TMeta extends ConnectionMeta,
> {
  /**
   * Broadcast a typed server event to the default channel.
   * @param event - Server event name (constrained by contract)
   * @param data - Event payload (type-checked against contract)
   */
  <E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): number;

  /**
   * Target a specific channel for broadcasting.
   * @param channel - Channel name
   */
  to(channel: InferChannels<C> | (string & {})): TypedEmitBuilder<C, TMeta>;
}

/**
 * Typed room context with contract-aware emit.
 */
export interface TypedRoomContext<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
> {
  /** The actor instance handling this connection */
  actor: VeraniActor<TMeta, E> & {
    /** Typed emit API for broadcasting */
    emit: TypedActorEmit<C, TMeta>;
  };
  /** The WebSocket connection */
  ws: WebSocket;
  /** Connection metadata */
  meta: TMeta;
  /** Typed socket-level emit API */
  emit: TypedSocketEmit<C, TMeta>;
}

/**
 * Typed message context for event handlers.
 */
export interface TypedMessageContext<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
> extends TypedRoomContext<C, TMeta, E> {
  /** The received message frame */
  frame: {
    type: string;
    channel?: string;
    data?: unknown;
  };
}

// ============================================================================
// Typed Room Definition
// ============================================================================

/**
 * Configuration for a typed room.
 */
export interface TypedRoomConfig<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
> {
  /** Optional room name for debugging */
  name?: string;

  /** WebSocket upgrade path (default: "/ws") */
  websocketPath?: string;

  /**
   * Extract metadata from the connection request.
   */
  extractMeta?(req: Request): TMeta | Promise<TMeta>;

  /**
   * Called when a new WebSocket connection is established.
   */
  onConnect?(ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;

  /**
   * Called when a WebSocket connection is closed.
   */
  onDisconnect?(ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;

  /**
   * Called when an error occurs in a lifecycle hook.
   */
  onError?(error: Error, ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;

  /**
   * Called after actor wakes from hibernation.
   */
  onHibernationRestore?(actor: VeraniActor<TMeta, E>): void | Promise<void>;
}

/**
 * Event handler for client events (typed).
 */
export type TypedEventHandler<
  C extends Contract,
  E extends ClientEventNames<C>,
  TMeta extends ConnectionMeta = ConnectionMeta,
  TEnv = unknown,
> = (
  ctx: TypedMessageContext<C, TMeta, TEnv>,
  data: ClientPayload<C, E>,
) => void | Promise<void>;

/**
 * Typed room with contract-aware event handling (Socket.io-like API).
 */
export interface TypedRoom<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
> {
  /**
   * Register a typed event handler for a client event.
   * The event name and data parameter are constrained by the contract.
   *
   * @param event - Client event name from the contract
   * @param handler - Handler function with typed data parameter
   *
   * @example
   * ```typescript
   * room.on("message.send", (ctx, data) => {
   *   // data: { text: string } - inferred from contract!
   *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
   * });
   * ```
   */
  on<TEvent extends ClientEventNames<C>>(
    event: TEvent,
    handler: TypedEventHandler<C, TEvent, TMeta, E>,
  ): void;

  /**
   * Remove an event handler.
   * @param event - Event name
   * @param handler - Optional specific handler to remove
   */
  off<TEvent extends ClientEventNames<C>>(
    event: TEvent,
    handler?: TypedEventHandler<C, TEvent, TMeta, E>,
  ): void;

  /**
   * The underlying room definition for use with createActorHandler.
   */
  readonly definition: RoomDefinition<TMeta, E>;

  /**
   * The contract this room is based on.
   */
  readonly contract: C;
}

// ============================================================================
// Emit Wrapper Factory
// ============================================================================

/**
 * Creates a typed emit wrapper around the base emit API.
 * This preserves runtime behavior while adding compile-time type checking.
 */
function createTypedSocketEmit<C extends Contract, TMeta extends ConnectionMeta>(
  baseEmit: BaseRoomContext<TMeta>["emit"],
): TypedSocketEmit<C, TMeta> {
  const emit = ((event: string, data: unknown) => {
    baseEmit.emit(event, data);
  }) as TypedSocketEmit<C, TMeta>;

  emit.to = (target: string) => {
    const builder = baseEmit.to(target);
    return {
      emit: (event: string, data: unknown) => builder.emit(event, data),
    } as TypedEmitBuilder<C, TMeta>;
  };

  return emit;
}

/**
 * Creates a typed actor emit wrapper.
 */
function createTypedActorEmit<C extends Contract, TMeta extends ConnectionMeta, E>(
  actor: VeraniActor<TMeta, E>,
): TypedActorEmit<C, TMeta> {
  const emit = ((event: string, data: unknown) => {
    return actor.emit.emit(event, data);
  }) as TypedActorEmit<C, TMeta>;

  emit.to = (channel: string) => {
    const builder = actor.emit.to(channel);
    return {
      emit: (event: string, data: unknown) => builder.emit(event, data),
    } as TypedEmitBuilder<C, TMeta>;
  };

  return emit;
}

/**
 * Wraps a base context with typed emit.
 */
function wrapContext<C extends Contract, TMeta extends ConnectionMeta, E>(
  baseCtx: BaseRoomContext<TMeta, E>,
): TypedRoomContext<C, TMeta, E> {
  return {
    actor: Object.assign({}, baseCtx.actor, {
      emit: createTypedActorEmit<C, TMeta, E>(baseCtx.actor),
    }),
    ws: baseCtx.ws,
    meta: baseCtx.meta,
    emit: createTypedSocketEmit<C, TMeta>(baseCtx.emit),
  };
}

/**
 * Wraps a message context with typed emit.
 */
function wrapMessageContext<C extends Contract, TMeta extends ConnectionMeta, E>(
  baseCtx: BaseMessageContext<TMeta, E>,
): TypedMessageContext<C, TMeta, E> {
  return {
    ...wrapContext<C, TMeta, E>(baseCtx),
    frame: baseCtx.frame,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a type-safe room based on a contract definition.
 *
 * This wraps the base `defineRoom()` function and adds:
 * - Typed `on()` method for registering event handlers
 * - Typed `emit` on context for sending server events
 * - Compile-time validation of event names and payloads
 *
 * @param contract - The contract defining events and payloads
 * @param config - Room configuration (lifecycle hooks, metadata extraction)
 * @returns A typed room with contract-aware APIs
 *
 * @example
 * ```typescript
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
 * export default createActorHandler(room.definition);
 * ```
 */
export function createTypedRoom<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
>(
  contract: C,
  config: TypedRoomConfig<C, TMeta, E>,
): TypedRoom<C, TMeta, E> {
  // Create the underlying room definition
  const baseRoom = defineRoom<TMeta, E>({
    name: config.name,
    websocketPath: config.websocketPath ?? "/ws",
    extractMeta: config.extractMeta,
    onConnect: config.onConnect
      ? (ctx) => config.onConnect!(wrapContext<C, TMeta, E>(ctx))
      : undefined,
    onDisconnect: config.onDisconnect
      ? (ctx) => config.onDisconnect!(wrapContext<C, TMeta, E>(ctx))
      : undefined,
    onError: config.onError
      ? (error, ctx) => config.onError!(error, wrapContext<C, TMeta, E>(ctx))
      : undefined,
    onHibernationRestore: config.onHibernationRestore,
  });

  // Check if contract has validation
  const hasValidation = isValidatedContract(contract);
  const onValidationError = hasValidation ? getValidationErrorHandler(contract) : undefined;

  // Create the typed room wrapper
  const typedRoom: TypedRoom<C, TMeta, E> = {
    on<TEvent extends ClientEventNames<C>>(
      event: TEvent,
      handler: TypedEventHandler<C, TEvent, TMeta, E>,
    ): void {
      baseRoom.on(event, (ctx, data) => {
        const typedCtx = wrapMessageContext<C, TMeta, E>(ctx);

        // Apply validation if contract has validators
        if (hasValidation) {
          const validator = getClientValidator(contract, event);
          if (validator) {
            const validated = validateData(
              validator,
              data,
              event as string,
              "client",
              onValidationError,
            );
            if (validated === undefined) {
              // Validation failed - don't call handler
              return;
            }
            return handler(typedCtx, validated as ClientPayload<C, TEvent>);
          }
        }

        return handler(typedCtx, data as ClientPayload<C, TEvent>);
      });
    },

    off<TEvent extends ClientEventNames<C>>(
      event: TEvent,
      _handler?: TypedEventHandler<C, TEvent, TMeta, E>,
    ): void {
      // Note: We can't match the exact handler since we wrap it,
      // so we remove all handlers for the event
      baseRoom.off(event);
    },

    get definition() {
      return baseRoom as unknown as RoomDefinition<TMeta, E>;
    },

    contract,
  };

  return typedRoom;
}

