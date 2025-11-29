import type { Actor } from "@cloudflare/actors";
import type { ConnectionMeta, MessageFrame } from "../shared/types";

export type { ConnectionMeta, MessageFrame };

/**
 * Options for broadcasting messages to connections
 */
export interface BroadcastOptions {
  /** Exclude specific WebSocket from receiving the broadcast */
  except?: WebSocket;
  /** Only send to specific user IDs */
  userIds?: string[];
  /** Only send to specific client IDs */
  clientIds?: string[];
}

/**
 * RPC-safe version of BroadcastOptions for use over RPC calls.
 * Excludes the `except` field since WebSocket cannot be serialized over RPC.
 */
export interface RpcBroadcastOptions {
  /** Only send to specific user IDs */
  userIds?: string[];
  /** Only send to specific client IDs */
  clientIds?: string[];
}

/**
 * Extended Actor interface with Verani-specific methods
 */
export interface VeraniActor<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> extends Actor<E> {
  /**
   * Map of active WebSocket sessions keyed by their WebSocket instance.
   * Each entry contains the WebSocket and its associated metadata.
   * See: @src/actor/actor-runtime.ts usage for session management.
   */
  sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>;

  /**
   * Broadcast a message to all connections in a channel.
   * Performs channel, userId, clientId, and exclusion filtering.
   * Returns the number of connections the message was sent to.
   * @see @src/actor/actor-runtime.ts broadcast()
   */
  broadcast(channel: string, data: any, opts?: BroadcastOptions): number;

  /**
   * Returns the number of currently connected WebSocket sessions.
   * @see @src/actor/actor-runtime.ts getSessionCount()
   */
  getSessionCount(): number;

  /**
   * Get all unique user IDs currently connected to this actor.
   * @see @src/actor/actor-runtime.ts getConnectedUserIds()
   */
  getConnectedUserIds(): string[];

  /**
   * Get all WebSocket sessions for a given user ID.
   * @see @src/actor/actor-runtime.ts getUserSessions()
   */
  getUserSessions(userId: string): WebSocket[];

  /**
   * Send a message to all sessions belonging to a user ID in a given channel.
   * Message will only be sent to sessions where the user's channels include the given channel.
   * Returns the number of sessions the message was sent to.
   * The message "type" is always "event" (see src/actor/actor-runtime.ts).
   * @see @src/actor/actor-runtime.ts sendToUser()
   */
  sendToUser(userId: string, channel: string, data?: any): number;

  /**
   * Validates and removes stale WebSocket sessions.
   * Called automatically during broadcast/send operations, but can be called manually.
   * Returns the number of stale sessions removed.
   * @see @src/actor/actor-runtime.ts cleanupStaleSessions()
   */
  cleanupStaleSessions(): number;

  /**
   * Access the Durable Object storage API for this actor instance.
   * @see @src/actor/actor-runtime.ts getStorage()
   */
  getStorage(): DurableObjectStorage;

  /**
   * Socket.io-like emit API for actor-level broadcasting
   */
  emit: ActorEmit<TMeta, E>;
}

/**
 * Event handler function type for socket.io-like event handling
 */
export type EventHandler<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> = (
  ctx: MessageContext<TMeta, E>,
  data: any
) => void | Promise<void>;

/**
 * Event emitter interface for room-level event handling
 */
export interface RoomEventEmitter<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /**
   * Register an event handler
   * @param event - Event name (supports wildcard "*")
   * @param handler - Handler function
   */
  on(event: string, handler: EventHandler<TMeta, E>): void;

  /**
   * Remove an event handler
   * @param event - Event name
   * @param handler - Optional specific handler to remove, or remove all handlers for event
   */
  off(event: string, handler?: EventHandler<TMeta, E>): void;

  /**
   * Emit an event to registered handlers
   * @param event - Event name
   * @param ctx - Message context
   * @param data - Event data
   */
  emit(event: string, ctx: MessageContext<TMeta, E>, data: any): Promise<void>;
}

/**
 * Builder interface for targeting specific scopes when emitting
 */
export interface EmitBuilder<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /**
   * Emit to the targeted scope
   * @param event - Event name
   * @param data - Event data
   * @returns Number of connections that received the message
   */
  emit(event: string, data?: any): number;
}

/**
 * Socket-level emit API (available on context)
 * Allows emitting to current socket, user, or channel
 */
export interface SocketEmit<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /**
   * Emit to the current socket
   * @param event - Event name
   * @param data - Event data
   */
  emit(event: string, data?: any): void;

  /**
   * Target a specific user or channel for emitting
   * @param target - User ID or channel name
   * @returns Builder for emitting to the target
   */
  to(target: string): EmitBuilder<TMeta, E>;
}

/**
 * Actor-level emit API (available on actor)
 * Allows broadcasting to channels
 */
export interface ActorEmit<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /**
   * Broadcast to default channel
   * @param event - Event name
   * @param data - Event data
   * @returns Number of connections that received the message
   */
  emit(event: string, data?: any): number;

  /**
   * Target a specific channel for broadcasting
   * @param channel - Channel name
   * @returns Builder for emitting to the channel
   */
  to(channel: string): EmitBuilder<TMeta, E>;
}

/**
 * Context provided to room lifecycle hooks
 */
export interface RoomContext<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /** The actor instance handling this connection */
  actor: VeraniActor<TMeta, E>;
  /** The WebSocket connection */
  ws: WebSocket;
  /** Connection metadata */
  meta: TMeta;
  /** Socket.io-like emit API for this connection */
  emit: SocketEmit<TMeta, E>;
}

/**
 * Context for onMessage hook with frame included
 */
export interface MessageContext<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>
  extends RoomContext<TMeta, E> {
  /** The received message frame */
  frame: MessageFrame;
}

/**
 * Room definition with lifecycle hooks
 *
 * **Important:** All lifecycle hooks are properly awaited if they return a Promise.
 * This ensures async operations complete before the actor proceeds to the next step
 * or potentially enters hibernation.
 */
export interface RoomDefinition<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /** Optional room name for debugging */
  name?: string;

  /** WebSocket upgrade path (default: "/ws") */
  websocketPath: string;

  /**
   * Extract metadata from the connection request.
   * This function is awaited if it returns a Promise.
   */
  extractMeta?(req: Request): TMeta | Promise<TMeta>;

  /**
   * Called when a new WebSocket connection is established.
   * This hook is awaited if it returns a Promise. The session is only added to the
   * sessions map after this hook completes successfully. If this hook throws, the
   * connection is closed and no orphaned session is created.
   */
  onConnect?(ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /**
   * Called when a WebSocket connection is closed.
   * This hook is awaited if it returns a Promise. The session is removed from the
   * sessions map before this hook is called.
   */
  onDisconnect?(ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /**
   * Called when a message is received from a connection.
   * This hook is awaited if it returns a Promise. The actor will not process
   * other messages from this connection until this hook completes.
   * 
   * **Note:** If event handlers are registered via `eventEmitter`, they take priority.
   * This hook is used as a fallback when no matching event handler is found.
   */
  onMessage?(ctx: MessageContext<TMeta, E>, frame: MessageFrame): void | Promise<void>;

  /**
   * Called when an error occurs in a lifecycle hook.
   * This hook is also awaited if it returns a Promise.
   */
  onError?(error: Error, ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /**
   * Called after actor wakes from hibernation and sessions are restored.
   * This hook is awaited if it returns a Promise. It is called even if some
   * sessions failed to restore, allowing you to handle partial restoration scenarios.
   */
  onHibernationRestore?(actor: VeraniActor<TMeta, E>): void | Promise<void>;

  /**
   * Event emitter for socket.io-like event handling.
   * If provided, event handlers registered here will be called for matching message types.
   * If not provided, a default event emitter will be created.
   */
  eventEmitter?: RoomEventEmitter<TMeta, E>;
}
