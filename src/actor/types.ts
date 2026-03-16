import type { Actor } from "@cloudflare/actors";
import type { ConnectionMeta, MessageFrame, WebSocketRawData } from "../shared/types";

export type { ConnectionMeta, MessageFrame, WebSocketRawData };

// ============================================================================
// Durable Object Binding Types
// ============================================================================

/**
 * Type for Durable Object namespace bindings.
 * Provides proper typing for DO.get() and ID methods.
 *
 * @template TStub - The stub interface type returned by get()
 */
export interface DurableObjectBinding<TStub> {
  get(id: DurableObjectId): TStub;
  idFromName(name: string): DurableObjectId;
  idFromString(hexId: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}

/**
 * Type alias for ConnectionDO binding
 */
export type ConnectionDOBinding = DurableObjectBinding<ConnectionActorStub>;

/**
 * Type alias for RoomDO binding
 */
export type RoomDOBinding = DurableObjectBinding<RoomActorStub>;

/**
 * Stub interface for RoomDO - forward declaration
 * Full definition is in room-actor.ts
 */
export interface RoomActorStub {
  join(userId: string, metadata?: Record<string, unknown>): Promise<void>;
  leave(userId: string): Promise<void>;
  broadcast(event: string, data?: unknown, opts?: BroadcastOptions): Promise<number>;
  getMembers(): Promise<RoomMember[]>;
  getMemberCount(): Promise<number>;
  hasMember(userId: string): Promise<boolean>;
}

// ============================================================================
// Broadcast Options
// ============================================================================

/**
 * Options for broadcasting messages to connections
 */
export interface BroadcastOptions {
  /** Exclude specific WebSocket from receiving the broadcast (local only) */
  except?: WebSocket;
  /** Exclude a specific userId from receiving the broadcast (RPC-safe) */
  exceptUserId?: string;
  /** Only send to specific user IDs */
  userIds?: string[];
  /** Only send to specific client IDs */
  clientIds?: string[];
}

export interface RoomEmitOptions {
  /** Include the sender when broadcasting to a room */
  includeSelf?: boolean;
}

/**
 * RPC-safe version of BroadcastOptions for use over RPC calls.
 * Excludes the `except` field since WebSocket cannot be serialized over RPC.
 */
export interface RpcBroadcastOptions {
  /** Exclude a specific userId from receiving the broadcast */
  exceptUserId?: string;
  /** Only send to specific user IDs */
  userIds?: string[];
  /** Only send to specific client IDs */
  clientIds?: string[];
}

// ============================================================================
// Room Coordination Types (RoomDO)
// ============================================================================

/**
 * Represents a member in a RoomDO
 */
export interface RoomMember {
  /** The user's unique identifier */
  userId: string;
  /** Timestamp when the user joined this room */
  joinedAt: number;
  /** Optional metadata associated with this member */
  metadata?: Record<string, unknown>;
}

/**
 * Definition for creating a RoomDO (coordination Durable Object)
 *
 * RoomDOs manage room membership and coordinate message delivery between
 * ConnectionDOs. They do NOT hold WebSocket connections directly.
 */
export interface RoomCoordinatorDefinition<E = unknown> {
  /** Optional room name for debugging */
  name?: string;

  /**
   * Environment binding key for the ConnectionDO class.
   * Must match the binding name in wrangler.toml/wrangler.jsonc.
   * Required for broadcast message delivery to work.
   *
   * @example "UserConnection"
   */
  connectionBinding?: string;

  /**
   * Maximum consecutive delivery failures before a member is considered stale
   * and automatically removed from the room. Default: 3
   */
  maxDeliveryFailures?: number;

  /**
   * Called when the RoomDO initializes or wakes from hibernation
   */
  onInit?(roomState: Record<string, unknown>): void | Promise<void>;

  /**
   * Called when a user joins this room
   */
  onJoin?(roomState: Record<string, unknown>, userId: string, metadata?: Record<string, unknown>): void | Promise<void>;

  /**
   * Called when a user leaves this room
   */
  onLeave?(roomState: Record<string, unknown>, userId: string): void | Promise<void>;

  /**
   * Called before the actor is destroyed and all storage is cleared.
   * Use for cleanup logic (e.g., notifying other services).
   */
  onDestroy?(roomState: Record<string, unknown>): void | Promise<void>;
}

// ============================================================================
// Connection Actor Types (ConnectionDO)
// ============================================================================

/**
 * Stub interface for ConnectionDO - supports RPC calls from other DOs
 *
 * ConnectionDOs own a single WebSocket connection and receive messages
 * from RoomDOs via RPC for delivery to their connected client.
 */
export interface ConnectionActorStub {
  /**
   * Standard fetch method for handling HTTP requests and WebSocket upgrades
   */
  fetch(request: Request): Promise<Response>;

  /**
   * Deliver a message to this connection's WebSocket (called via RPC from RoomDO)
   * @param event - Event name
   * @param data - Event data
   * @returns Promise resolving to true if delivered, false if connection is closed
   */
  deliverMessage<TData = unknown>(event: string, data?: TData): Promise<boolean>;

  /**
   * Deliver a system event to this connection (presence updates, room events, etc.)
   * @param type - System event type
   * @param payload - Event payload
   */
  deliverSystemEvent<TPayload = unknown>(type: string, payload?: TPayload): Promise<void>;

  /**
   * Get the userId this connection belongs to
   */
  getUserId(): Promise<string | null>;

  /**
   * Check if this connection is still active
   */
  isConnected(): Promise<boolean>;

  /**
   * Join a room (registers with the RoomDO)
   * @param roomName - Name of the room to join
   * @param metadata - Optional metadata to include with membership
   */
  joinRoom(roomName: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Leave a room (unregisters from the RoomDO)
   * @param roomName - Name of the room to leave
   */
  leaveRoom(roomName: string): Promise<void>;

  /**
   * Get list of rooms this connection is a member of
   */
  getRooms(): Promise<string[]>;
}

/**
 * Environment type with Durable Object bindings for Verani.
 * Users should extend this with their actual binding names from wrangler.toml.
 *
 * @example
 * ```typescript
 * interface Env extends VeraniEnv {
 *   UserConnection: DurableObjectNamespace;
 *   PresenceRoom: DurableObjectNamespace;
 *   ChatRoom: DurableObjectNamespace;
 * }
 * ```
 */
export interface VeraniEnv {
  [key: string]: unknown;
}

/**
 * ConnectionActor interface for single-WebSocket-per-DO model
 *
 * Each ConnectionActor owns exactly one WebSocket connection for a single user.
 */
export interface ConnectionActor<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown, TState extends Record<string, unknown> = Record<string, unknown>> extends Actor<E> {
  /**
   * The single WebSocket connection owned by this DO (null if not connected)
   */
  ws: WebSocket | null;

  /**
   * Connection metadata for this user
   */
  meta: TMeta | null;

  /**
   * Set of room names this connection is a member of
   */
  rooms: Set<string>;

  /**
   * User-defined persisted state for this connection actor
   */
  connectionState: TState;

  /**
   * Check if this connection has an active WebSocket
   */
  isConnected(): boolean;

  /**
   * Deliver a message to this connection's WebSocket
   * Called via RPC from RoomDO
   */
  deliverMessage<TData = unknown>(event: string, data?: TData): Promise<boolean>;

  /**
   * Deliver a system event (presence, room events, etc.)
   */
  deliverSystemEvent<TPayload = unknown>(type: string, payload?: TPayload): Promise<void>;

  /**
   * Join a room (register with RoomDO)
   */
  joinRoom(roomName: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Leave a room (unregister from RoomDO)
   */
  leaveRoom(roomName: string): Promise<void>;

  /**
   * Socket.io-like emit API for this connection
   */
  emit: ConnectionEmit<TMeta, E>;

  /**
   * Access the Durable Object storage API
   */
  getStorage(): DurableObjectStorage;
}

/**
 * Connection-level emit API (for single-connection DO)
 * Routes to appropriate RoomDO or ConnectionDO via RPC
 */
export interface ConnectionEmit<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  /**
   * Emit to this connection's WebSocket
   * @param event - Event name
   * @param data - Event data
   */
  emit<TData = unknown>(event: string, data?: TData): void;

  /**
   * Target a specific room or user for emitting
   * @param target - Room name (if starts with "room:") or userId
   * @returns Builder for emitting to the target via RPC
   */
  to(target: string): AsyncEmitBuilder;

  /**
   * Target a specific room for broadcasting
   * @param roomName - Room name
   * @returns Builder for broadcasting to the room via RPC
   */
  toRoom(roomName: string, options?: RoomEmitOptions): AsyncEmitBuilder;

  /**
   * Target a specific user for direct messaging
   * @param userId - User ID
   * @returns Builder for sending to the user via RPC
   */
  toUser(userId: string): AsyncEmitBuilder;
}

/**
 * Async emit builder for RPC-based emit operations
 */
export interface AsyncEmitBuilder {
  /**
   * Emit to the targeted scope via RPC
   * @param event - Event name
   * @param data - Event data
   * @returns Promise resolving to number of recipients
   */
  emit<TData = unknown>(event: string, data?: TData): Promise<number>;
}

