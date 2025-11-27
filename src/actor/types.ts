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
   * Access the Durable Object storage API for this actor instance.
   * @see @src/actor/actor-runtime.ts getStorage()
   */
  getStorage(): DurableObjectStorage;
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
 */
export interface RoomDefinition<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /** Optional room name for debugging */
  name?: string;

  /** WebSocket upgrade path (default: "/ws") */
  websocketPath: string;

  /** Extract metadata from the connection request */
  extractMeta?(req: Request): TMeta | Promise<TMeta>;

  /** Called when a new WebSocket connection is established */
  onConnect?(ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /** Called when a WebSocket connection is closed */
  onDisconnect?(ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /** Called when a message is received from a connection */
  onMessage?(ctx: MessageContext<TMeta, E>, frame: MessageFrame): void | Promise<void>;

  /** Called when an error occurs in a lifecycle hook */
  onError?(error: Error, ctx: RoomContext<TMeta, E>): void | Promise<void>;

  /** Called after actor wakes from hibernation and sessions are restored */
  onHibernationRestore?(actor: VeraniActor<TMeta, E>): void | Promise<void>;
}
