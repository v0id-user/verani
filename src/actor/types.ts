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
  sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>;
  broadcast(channel: string, data: any, opts?: BroadcastOptions): number;
  getSessionCount(): number;
  getConnectedUserIds(): string[];
  getUserSessions(userId: string): WebSocket[];
  sendToUser(userId: string, type: string, data?: any): number;
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
}
