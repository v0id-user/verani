/**
 * Type-Safe Server Integration for Verani
 *
 * Provides createTypedConnection() which wraps defineConnection() with full type safety
 * for event handlers and emit operations based on a contract definition.
 *
 * @example
 * ```typescript
 * const connection = createTypedConnection(chatContract, {
 *   websocketPath: "/ws/chat",
 *   extractMeta(req) {
 *     return { userId: "...", clientId: "...", channels: ["default"] };
 *   },
 *   async onConnect(ctx) {
 *     ctx.emit("user.joined", { userId: ctx.meta.userId });
 *     await ctx.actor.joinRoom("chat");
 *   },
 * });
 *
 * connection.on("message.send", (ctx, data) => {
 *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
 * });
 *
 * export const ChatConnection = createConnectionHandler(connection.definition);
 * ```
 *
 * @packageDocumentation
 */

import { defineConnection } from "../actor/connection-actor";
import type {
  ConnectionDefinition,
  ConnectionContext as BaseConnectionContext,
  ConnectionHandlerInstance,
} from "../actor/connection-actor";
import type {
  ConnectionMeta,
  ConnectionEmit,
  AsyncEmitBuilder,
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
 * Typed async emit builder for targeting specific scopes.
 */
export interface TypedAsyncEmitBuilder<
  C extends Contract,
  TMeta extends ConnectionMeta,
> {
  /**
   * Emit a typed server event to the targeted scope via RPC.
   * @param event - Server event name (constrained by contract)
   * @param data - Event payload (type-checked against contract)
   */
  emit<E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): Promise<number>;
}

/**
 * Typed connection-level emit API.
 * Available on context for emitting to current socket, rooms, or users.
 */
export interface TypedConnectionEmit<
  C extends Contract,
  TMeta extends ConnectionMeta,
> {
  /**
   * Emit a typed server event to this connection's WebSocket.
   * @param event - Server event name (constrained by contract)
   * @param data - Event payload (type-checked against contract)
   */
  <E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): void;

  /**
   * Target a specific room or user for emitting.
   * @param target - Room name (if starts with "room:") or userId
   */
  to(target: string): TypedAsyncEmitBuilder<C, TMeta>;

  /**
   * Target a specific room for broadcasting.
   * @param roomName - Room name
   */
  toRoom(roomName: string): TypedAsyncEmitBuilder<C, TMeta>;

  /**
   * Target a specific user for direct messaging.
   * @param userId - User ID
   */
  toUser(userId: string): TypedAsyncEmitBuilder<C, TMeta>;
}

/**
 * Typed connection context with contract-aware emit.
 */
export interface TypedConnectionContext<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The connection actor instance */
  actor: ConnectionHandlerInstance<TMeta, E, TState>;
  /** The WebSocket connection (may be null after disconnect) */
  ws: WebSocket | null;
  /** Connection metadata */
  meta: TMeta;
  /** Typed connection-level emit API */
  emit: TypedConnectionEmit<C, TMeta>;
  /** Persisted state */
  state: TState;
}

/**
 * Typed message context for event handlers.
 */
export interface TypedMessageContext<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends TypedConnectionContext<C, TMeta, E, TState> {
  /** The received message frame */
  frame: {
    type: string;
    channel?: string;
    data?: unknown;
  };
}

// ============================================================================
// Typed Connection Definition
// ============================================================================

/**
 * Configuration for a typed connection.
 */
export interface TypedConnectionConfig<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Optional name for debugging */
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
  onConnect?(ctx: TypedConnectionContext<C, TMeta, E, TState>): void | Promise<void>;

  /**
   * Called when a WebSocket connection is closed.
   */
  onDisconnect?(ctx: TypedConnectionContext<C, TMeta, E, TState>): void | Promise<void>;

  /**
   * Called when an error occurs in a lifecycle hook.
   */
  onError?(error: Error, ctx: TypedConnectionContext<C, TMeta, E, TState>): void | Promise<void>;

  /**
   * Called after actor wakes from hibernation.
   */
  onHibernationRestore?(actor: ConnectionHandlerInstance<TMeta, E, TState>): void | Promise<void>;

  /**
   * Initial state for this connection.
   */
  state?: TState;

  /**
   * Keys to persist to storage.
   */
  persistedKeys?: (string & keyof TState)[];
}

/**
 * Event handler for client events (typed).
 */
export type TypedEventHandler<
  C extends Contract,
  EV extends ClientEventNames<C>,
  TMeta extends ConnectionMeta = ConnectionMeta,
  TEnv = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = (
  ctx: TypedMessageContext<C, TMeta, TEnv, TState>,
  data: ClientPayload<C, EV>,
) => void | Promise<void>;

/**
 * Typed connection with contract-aware event handling (Socket.io-like API).
 */
export interface TypedConnection<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
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
   * connection.on("message.send", (ctx, data) => {
   *   // data: { text: string } - inferred from contract!
   *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
   * });
   * ```
   */
  on<TEvent extends ClientEventNames<C>>(
    event: TEvent,
    handler: TypedEventHandler<C, TEvent, TMeta, E, TState>,
  ): void;

  /**
   * Remove an event handler.
   * @param event - Event name
   * @param handler - Optional specific handler to remove
   */
  off<TEvent extends ClientEventNames<C>>(
    event: TEvent,
    handler?: TypedEventHandler<C, TEvent, TMeta, E, TState>,
  ): void;

  /**
   * The underlying connection definition for use with createConnectionHandler.
   */
  readonly definition: ConnectionDefinition<TMeta, E, TState>;

  /**
   * The contract this connection is based on.
   */
  readonly contract: C;
}

// ============================================================================
// Emit Wrapper Factory
// ============================================================================

/**
 * Creates a typed emit wrapper around the base connection emit API.
 * This preserves runtime behavior while adding compile-time type checking.
 */
function createTypedConnectionEmit<C extends Contract, TMeta extends ConnectionMeta>(
  baseEmit: ConnectionEmit<TMeta>,
): TypedConnectionEmit<C, TMeta> {
  const emit = ((event: string, data: unknown) => {
    baseEmit.emit(event, data);
  }) as TypedConnectionEmit<C, TMeta>;

  emit.to = (target: string) => {
    const builder = baseEmit.to(target);
    return {
      emit: (event: string, data: unknown) => builder.emit(event, data),
    } as TypedAsyncEmitBuilder<C, TMeta>;
  };

  emit.toRoom = (roomName: string) => {
    const builder = baseEmit.toRoom(roomName);
    return {
      emit: (event: string, data: unknown) => builder.emit(event, data),
    } as TypedAsyncEmitBuilder<C, TMeta>;
  };

  emit.toUser = (userId: string) => {
    const builder = baseEmit.toUser(userId);
    return {
      emit: (event: string, data: unknown) => builder.emit(event, data),
    } as TypedAsyncEmitBuilder<C, TMeta>;
  };

  return emit;
}

/**
 * Wraps a base connection context with typed emit.
 */
function wrapContext<C extends Contract, TMeta extends ConnectionMeta, E, TState extends Record<string, unknown>>(
  baseCtx: BaseConnectionContext<TMeta, E, TState>,
): TypedConnectionContext<C, TMeta, E, TState> {
  return {
    actor: baseCtx.actor,
    ws: baseCtx.ws,
    meta: baseCtx.meta,
    emit: createTypedConnectionEmit<C, TMeta>(baseCtx.emit),
    state: baseCtx.state,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a type-safe connection based on a contract definition.
 *
 * This wraps the base `defineConnection()` function and adds:
 * - Typed `on()` method for registering event handlers
 * - Typed `emit` on context for sending server events
 * - Compile-time validation of event names and payloads
 *
 * @param contract - The contract defining events and payloads
 * @param config - Connection configuration (lifecycle hooks, metadata extraction)
 * @returns A typed connection with contract-aware APIs
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
 * const connection = createTypedConnection(chatContract, {
 *   websocketPath: "/ws/chat",
 *   async onConnect(ctx) {
 *     ctx.emit("chat.message", { from: "system", text: "Welcome!" });
 *     await ctx.actor.joinRoom("chat");
 *   },
 * });
 *
 * connection.on("message.send", (ctx, data) => {
 *   ctx.emit("chat.message", { from: ctx.meta.userId, text: data.text });
 * });
 *
 * export const ChatConnection = createConnectionHandler(connection.definition);
 * ```
 */
export function createTypedConnection<
  C extends Contract,
  TMeta extends ConnectionMeta = ConnectionMeta,
  E = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
>(
  contract: C,
  config: TypedConnectionConfig<C, TMeta, E, TState>,
): TypedConnection<C, TMeta, E, TState> {
  // Create the underlying connection definition
  const baseConnection = defineConnection<TMeta, E, TState>({
    name: config.name,
    websocketPath: config.websocketPath ?? "/ws",
    extractMeta: config.extractMeta,
    state: config.state,
    persistedKeys: config.persistedKeys,
    onConnect: config.onConnect
      ? (ctx) => config.onConnect!(wrapContext<C, TMeta, E, TState>(ctx))
      : undefined,
    onDisconnect: config.onDisconnect
      ? (ctx) => config.onDisconnect!(wrapContext<C, TMeta, E, TState>(ctx))
      : undefined,
    onError: config.onError
      ? (error, ctx) => config.onError!(error, wrapContext<C, TMeta, E, TState>(ctx))
      : undefined,
    onHibernationRestore: config.onHibernationRestore,
  });

  // Check if contract has validation
  const hasValidation = isValidatedContract(contract);
  const onValidationError = hasValidation ? getValidationErrorHandler(contract) : undefined;

  // Create the typed connection wrapper
  const typedConnection: TypedConnection<C, TMeta, E, TState> = {
    on<TEvent extends ClientEventNames<C>>(
      event: TEvent,
      handler: TypedEventHandler<C, TEvent, TMeta, E, TState>,
    ): void {
      baseConnection.on(event, (ctx: BaseConnectionContext<TMeta, E, TState>, data: unknown) => {
        const typedCtx = wrapContext<C, TMeta, E, TState>(ctx);
        const messageCtx: TypedMessageContext<C, TMeta, E, TState> = {
          ...typedCtx,
          frame: { type: event as string, data },
        };

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
            return handler(messageCtx, validated as ClientPayload<C, TEvent>);
          }
        }

        return handler(messageCtx, data as ClientPayload<C, TEvent>);
      });
    },

    off<TEvent extends ClientEventNames<C>>(
      event: TEvent,
      _handler?: TypedEventHandler<C, TEvent, TMeta, E, TState>,
    ): void {
      // Note: We can't match the exact handler since we wrap it,
      // so we remove all handlers for the event
      baseConnection.off(event as string);
    },

    get definition() {
      return baseConnection as unknown as ConnectionDefinition<TMeta, E, TState>;
    },

    contract,
  };

  return typedConnection;
}

// Keep backward-compatible alias
export { createTypedConnection as createTypedRoom };

// Re-export types with backward-compatible aliases
export type { TypedConnectionConfig as TypedRoomConfig };
export type { TypedConnectionContext as TypedRoomContext };
export type { TypedConnection as TypedRoom };
export type { TypedConnectionEmit as TypedSocketEmit };
export type { TypedAsyncEmitBuilder as TypedEmitBuilder };
// Legacy alias - not applicable to new architecture
export type TypedActorEmit<C extends Contract, TMeta extends ConnectionMeta> = TypedConnectionEmit<C, TMeta>;
