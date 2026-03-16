import { Actor, ActorConfiguration } from "@cloudflare/actors";
import type {
	ConnectionMeta,
	ConnectionActorStub,
	ConnectionEmit,
	AsyncEmitBuilder,
	BroadcastOptions,
	RoomEmitOptions,
	RoomDOBinding,
	ConnectionDOBinding,
	WebSocketRawData
} from "./types";
import type { RoomActorStub } from "./room-actor";
import { storeAttachment } from "./attachment";
import { encodeFrame } from "./protocol";
import {
	initializePersistedState,
	isStateReady as checkStateReady,
	setPeristErrorHandler,
	STATE_READY,
	PERSISTED_STATE,
	type PersistableActor
} from "./persist";

/**
 * Symbol keys for internal state
 */
const WS = Symbol("WS");
const META = Symbol("META");
const ROOMS = Symbol("ROOMS");

/**
 * Stored room entry with metadata for persistence
 */
interface StoredRoom {
	roomName: string;
	metadata?: Record<string, unknown>;
}

/**
 * Definition for creating a ConnectionDO (per-user connection handler)
 */
export interface ConnectionDefinition<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
> {
	/** Optional name for debugging */
	name?: string;

	/** WebSocket upgrade path (default: "/ws") */
	websocketPath?: string;

	/**
	 * Map of room names to their environment binding keys.
	 * Must match binding names in wrangler.toml/wrangler.jsonc.
	 * Required for room features (joinRoom, toRoom, etc.).
	 *
	 * @example { "presence": "PresenceRoom", "chat": "ChatRoom" }
	 */
	rooms?: Record<string, string>;

	/**
	 * Environment binding key for the ConnectionDO class.
	 * Must match the binding name in wrangler.toml/wrangler.jsonc.
	 * Required for user-to-user messaging (toUser).
	 *
	 * @example "UserConnection"
	 */
	connectionBinding?: string;

	/**
	 * Extract metadata from the connection request
	 */
	extractMeta?(req: Request): TMeta | Promise<TMeta>;

	/**
	 * Called when a WebSocket connection is established
	 */
	onConnect?(ctx: ConnectionContext<TMeta, E, TState>): void | Promise<void>;

	/**
	 * Called when the WebSocket connection is closed
	 */
	onDisconnect?(ctx: ConnectionContext<TMeta, E, TState>): void | Promise<void>;

	/**
	 * Called when a message is received from the WebSocket
	 */
	onMessage?(ctx: ConnectionContext<TMeta, E, TState>, frame: unknown): void | Promise<void>;

	/**
	 * Called when an error occurs
	 */
	onError?(error: Error, ctx: ConnectionContext<TMeta, E, TState>): void | Promise<void>;

	/**
	 * Called after waking from hibernation
	 */
	onHibernationRestore?(actor: ConnectionHandlerInstance<TMeta, E, TState>): void | Promise<void>;

	/**
	 * Event handlers map (socket.io-like)
	 */
	handlers?: Map<string, (ctx: ConnectionContext<TMeta, E, TState>, data: unknown) => void | Promise<void>>;

	/**
	 * Initial state for this connection
	 */
	state?: TState;

	/**
	 * Keys to persist to storage
	 */
	persistedKeys?: (string & keyof TState)[];

	/**
	 * Persistence options
	 */
	persistOptions?: { shallow?: boolean; throwOnError?: boolean };

	/**
	 * Called when persistence fails
	 */
	onPersistError?(key: string, error: Error): void;

	/**
	 * Called before the actor is destroyed and all storage is cleared.
	 * Use for cleanup (e.g., leaving rooms, notifying services).
	 */
	onDestroy?(ctx: ConnectionContext<TMeta, E, TState>): void | Promise<void>;
}

/**
 * Instance interface for ConnectionHandler actors
 * Used for typing the actor parameter in lifecycle hooks
 */
export interface ConnectionHandlerInstance<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
> {
	connectionState: TState;
	isStateReady(): boolean;
	getStorage(): DurableObjectStorage;
	joinRoom(roomName: string, metadata?: Record<string, unknown>): Promise<void>;
	leaveRoom(roomName: string): Promise<void>;
	getRooms(): Promise<string[]>;
}

/**
 * Context provided to connection lifecycle hooks
 */
export interface ConnectionContext<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
> {
	/** The connection actor instance */
	actor: ConnectionHandlerInstance<TMeta, E, TState>;
	/** The WebSocket connection (may be null after disconnect) */
	ws: WebSocket | null;
	/** Connection metadata */
	meta: TMeta;
	/** Socket.io-like emit API */
	emit: ConnectionEmit<TMeta, E>;
	/** Persisted state */
	state: TState;
}

/**
 * Return type for createConnectionHandler
 */
export type ConnectionHandlerClass<E = unknown> = {
	new(state: any, env: E): Actor<E>;
	get(userId: string): ConnectionActorStub;
	configuration(request?: Request): ActorConfiguration;
};

/**
 * Creates a Connection handler (per-user Durable Object)
 *
 * Each ConnectionDO owns exactly ONE WebSocket connection for a single user.
 * Messages are received via RPC from RoomDOs and delivered to the WebSocket.
 *
 * @param definition - Connection definition with lifecycle hooks
 * @returns ConnectionDO class for Cloudflare Workers
 *
 * @example
 * ```typescript
 * const UserConnection = createConnectionHandler({
 *   name: "user-connection",
 *   extractMeta: (req) => ({
 *     userId: extractUserIdFromToken(req),
 *     clientId: crypto.randomUUID(),
 *     channels: ["default"]
 *   }),
 *   onConnect: (ctx) => {
 *     console.log(`User ${ctx.meta.userId} connected`);
 *     ctx.actor.joinRoom("presence");
 *   },
 *   onDisconnect: (ctx) => {
 *     console.log(`User ${ctx.meta.userId} disconnected`);
 *   }
 * });
 *
 * // In Worker:
 * const userId = extractUserId(request);
 * const stub = UserConnection.get(userId);
 * return stub.fetch(request);
 * ```
 */
export function createConnectionHandler<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
>(
	definition: ConnectionDefinition<TMeta, E, TState>
): ConnectionHandlerClass<E> {
	const className = definition.name || "VeraniConnectionDO";
	const websocketPath = definition.websocketPath || "/ws";

	class NamedConnectionClass extends Actor<E> {
		/**
		 * The single WebSocket connection (null if not connected)
		 */
		[WS]: WebSocket | null = null;

		/**
		 * Connection metadata
		 */
		[META]: TMeta | null = null;

		/**
		 * Map of room names to their join metadata
		 * This is persisted to storage and restored on hibernation wake
		 */
		[ROOMS] = new Map<string, Record<string, unknown> | undefined>();

		/**
		 * State persistence support
		 */
		[STATE_READY] = false;
		[PERSISTED_STATE]: Record<string, unknown> = definition.state ? { ...definition.state } : {};

		/**
		 * Event handlers (socket.io-like)
		 */
		private handlers = new Map<string, (ctx: ConnectionContext<TMeta, E, TState>, data: unknown) => void | Promise<void>>();

		/**
		 * Get persisted state
		 */
		get connectionState(): TState {
			return this[PERSISTED_STATE] as TState;
		}

		/**
		 * Check if state is ready
		 */
		isStateReady(): boolean {
			return checkStateReady(this as unknown as PersistableActor);
		}

		/**
		 * Static configuration for WebSocket upgrade
		 */
		static configuration(request?: Request): ActorConfiguration {
			return {
				sockets: {
					upgradePath: websocketPath
				}
			};
		}

		/**
		 * Get RoomDO binding from environment by room name
		 */
		private getRoomBinding(roomName: string): RoomDOBinding {
			if (!definition.rooms) {
				throw new Error(
					`Cannot access room "${roomName}": no "rooms" config provided in ConnectionDefinition. ` +
					`Add rooms: { "${roomName}": "YourRoomBinding" } to your definition.`
				);
			}

			const bindingKey = definition.rooms[roomName] ?? definition.rooms[roomName.split(":", 1)[0]];
			if (!bindingKey) {
				throw new Error(
					`Cannot access room "${roomName}": not found in "rooms" config. ` +
					`Available rooms: ${Object.keys(definition.rooms).join(", ")}`
				);
			}

			const env = this.env as Record<string, unknown>;
			const binding = env[bindingKey] as RoomDOBinding | undefined;
			if (!binding) {
				throw new Error(
					`Room "${roomName}" binding "${bindingKey}" not found in environment. ` +
					`Check your wrangler.toml durable_objects bindings.`
				);
			}

			return binding;
		}

		/**
		 * Get ConnectionDO binding from environment (for user-to-user messaging)
		 */
		private getConnectionBinding(): ConnectionDOBinding {
			if (!definition.connectionBinding) {
				throw new Error(
					`Cannot resolve ConnectionDO: no "connectionBinding" provided in ConnectionDefinition. ` +
					`Add connectionBinding: "YourConnectionBinding" to your definition.`
				);
			}

			const env = this.env as Record<string, unknown>;
			const binding = env[definition.connectionBinding] as ConnectionDOBinding | undefined;
			if (!binding) {
				throw new Error(
					`ConnectionDO binding "${definition.connectionBinding}" not found in environment. ` +
					`Check your wrangler.toml durable_objects bindings.`
				);
			}

			return binding;
		}

		/**
		 * Create emit API for this connection
		 */
		private createEmit(): ConnectionEmit<TMeta, E> {
			const self = this;

		return {
			emit<TData = unknown>(event: string, data?: TData): void {
				self.sendToWebSocket(event, data);
			},

				to(target: string): AsyncEmitBuilder {
					// Check if target is a room or user
					if (target.startsWith("room:")) {
						return self.createRoomEmitBuilder(target.slice(5));
					}
					// Default to user targeting
					return self.createUserEmitBuilder(target);
				},

				toRoom(roomName: string, options?: RoomEmitOptions): AsyncEmitBuilder {
					return self.createRoomEmitBuilder(roomName, options);
				},

				toUser(userId: string): AsyncEmitBuilder {
					return self.createUserEmitBuilder(userId);
				}
			};
		}

		/**
		 * Create emit builder for room broadcast
		 */
		private createRoomEmitBuilder(roomName: string, options?: RoomEmitOptions): AsyncEmitBuilder {
			const self = this;
			return {
				async emit<TData = unknown>(event: string, data?: TData): Promise<number> {
					const RoomDO = self.getRoomBinding(roomName);
					const roomStub = RoomDO.get(RoomDO.idFromName(roomName)) as RoomActorStub;
					const opts: BroadcastOptions | undefined =
						options?.includeSelf || !self[META]?.userId
							? undefined
							: { exceptUserId: self[META].userId };
					return await roomStub.broadcast(event, data, opts);
				}
			};
		}

		/**
		 * Create emit builder for direct user messaging
		 */
		private createUserEmitBuilder(userId: string): AsyncEmitBuilder {
			const self = this;
			return {
				async emit<TData = unknown>(event: string, data?: TData): Promise<number> {
					const ConnectionDO = self.getConnectionBinding();
					const userStub = ConnectionDO.get(ConnectionDO.idFromName(userId)) as ConnectionActorStub;
					const success = await userStub.deliverMessage(event, data);
					return success ? 1 : 0;
				}
			};
		}

		/**
		 * Lazily restore WebSocket after hibernation wake.
		 * Raw namespace.get() bypasses Actor.get() → setName() → onInit(),
		 * so this[WS] may be null even though a hibernated WebSocket exists.
		 */
		private restoreWebSocketIfNeeded(): void {
			if (this[WS]) return;

			const sockets = this.ctx.getWebSockets();
			if (sockets.length > 0 && sockets[0].readyState === WebSocket.OPEN) {
				this[WS] = sockets[0];
				const meta = sockets[0].deserializeAttachment() as TMeta | undefined;
				if (meta) {
					this[META] = meta;
				}
			}
		}

		/**
		 * Send a message to this connection's WebSocket
		 */
		private sendToWebSocket<TData = unknown>(event: string, data?: TData): boolean {
			const ws = this[WS];
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				return false;
			}

			try {
				const eventData = { type: event, ...(data as object) };
				const frame = { type: "event", channel: "default", data: eventData };
				ws.send(encodeFrame(frame));
				return true;
			} catch {
				return false;
			}
		}

		/**
		 * Create context for lifecycle hooks
		 */
		private createContext(): ConnectionContext<TMeta, E, TState> {
			return {
				actor: this,
				ws: this[WS],
				meta: this[META]!,
				emit: this.createEmit(),
				state: this.connectionState as TState
			};
		}

		// =====================================================================
		// Lifecycle Methods
		// =====================================================================

		/**
		 * Called when DO initializes or wakes from hibernation
		 */
		protected async onInit() {
			// Initialize persisted state if defined
			if (definition.state) {
				if (definition.onPersistError) {
					setPeristErrorHandler(
						this as unknown as PersistableActor,
						definition.onPersistError
					);
				}

				const initializedState = await initializePersistedState(
					this as unknown as PersistableActor,
					definition.state,
					definition.persistedKeys as string[] | undefined,
					definition.persistOptions
				);

				this[PERSISTED_STATE] = initializedState;
			}

			// Restore rooms from storage (with metadata)
			const storedRooms = await this.ctx.storage.get<StoredRoom[]>("_connection_rooms");
			if (storedRooms && Array.isArray(storedRooms)) {
				this[ROOMS] = new Map(storedRooms.map(r => [r.roomName, r.metadata]));
			}

			// Copy handlers from definition
			if (definition.handlers) {
				for (const [event, handler] of definition.handlers.entries()) {
					this.handlers.set(event, handler);
				}
			}

			// Restore WebSocket from hibernation if exists
			const websockets = this.ctx.getWebSockets();
			if (websockets.length > 0) {
				const ws = websockets[0];
				if (ws.readyState === WebSocket.OPEN) {
					this[WS] = ws;
					const meta = ws.deserializeAttachment() as TMeta | undefined;
					if (meta) {
						this[META] = meta;

						// Auto-rejoin all rooms after hibernation
						await this.rejoinRoomsAfterHibernation();

						// Call user-defined hook (optional, for custom logic)
						if (definition.onHibernationRestore) {
							await definition.onHibernationRestore(this);
						}
					}
				}
			}

		}

		/**
		 * Allow WebSocket upgrades (overrides Actor base class default of false)
		 */
		protected shouldUpgradeSocket(request: Request): boolean {
			return true;
		}

		/**
		 * Handle WebSocket upgrade — creates WebSocketPair directly,
		 * bypassing the Sockets class which stores conflicting attachment metadata.
		 */
		protected onWebSocketUpgrade(request: Request): Response {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);
			this.ctx.acceptWebSocket(server);
			const response = new Response(null, { status: 101, webSocket: client });
			Promise.resolve().then(() => {
				this.onWebSocketConnect(server, request);
			});
			return response;
		}

		/**
		 * Handle WebSocket connection
		 */
		protected async onWebSocketConnect(ws: WebSocket, req: Request) {
			// Close existing connection if any (single connection per DO)
			if (this[WS] && this[WS].readyState === WebSocket.OPEN) {
				this[WS].close(1000, "New connection established");
			}

			// Extract metadata
			let meta: TMeta;
			if (definition.extractMeta) {
				meta = await definition.extractMeta(req);
			} else {
				meta = {
					userId: "anonymous",
					clientId: crypto.randomUUID(),
					channels: ["default"]
				} as unknown as TMeta;
			}

			// Store attachment for hibernation
			storeAttachment(ws, meta);

			// Set connection
			this[WS] = ws;
			this[META] = meta;

			// Call onConnect hook
			if (definition.onConnect) {
				try {
					await definition.onConnect(this.createContext());
				} catch (error) {
					if (definition.onError) {
						await definition.onError(error as Error, this.createContext());
					}
					ws.close(1011, "Connection handler error");
					return;
				}
			}

		}

		/**
		 * Handle WebSocket message
		 */
		protected async onWebSocketMessage(ws: WebSocket, raw: WebSocketRawData) {
			if (!this[META]) return;

			try {
				// Parse message
				const str = typeof raw === "string" ? raw : raw.toString();
				const frame: unknown = JSON.parse(str);
				const frameObj = frame as Record<string, unknown>;
				const frameData = frameObj.data as Record<string, unknown> | undefined;
				const eventType = (frameData?.type || frameObj.type) as string;

				// Check for registered handler
				const handler = this.handlers.get(eventType);
				if (handler) {
					await handler(this.createContext(), frameData);
					return;
				}

				// Fall back to onMessage hook
				if (definition.onMessage) {
					await definition.onMessage(this.createContext(), frame);
				}
			} catch (error) {
				if (definition.onError) {
					await definition.onError(error as Error, this.createContext());
				}
			}
		}

		/**
		 * Handle WebSocket disconnect
		 */
		protected async onWebSocketDisconnect(ws: WebSocket) {
			if (this[META] && definition.onDisconnect) {
				try {
					await definition.onDisconnect(this.createContext());
				} catch {
					// User hook error — non-fatal
				}
			}

			// Leave all rooms
			for (const roomName of this[ROOMS].keys()) {
				try {
					await this.leaveRoomInternal(roomName);
				} catch {
					// RPC failure during disconnect — non-fatal
				}
			}

			this[WS] = null;
		}

		// =====================================================================
		// RPC Methods (called from RoomDO or other ConnectionDOs)
		// =====================================================================

		/**
		 * Deliver a message to this connection's WebSocket
		 * Called via RPC from RoomDO during broadcast
		 */
		async deliverMessage<TData = unknown>(event: string, data?: TData): Promise<boolean> {
			this.restoreWebSocketIfNeeded();
			return this.sendToWebSocket(event, data);
		}

		/**
		 * Deliver a system event (presence updates, room events, etc.)
		 */
		async deliverSystemEvent<TPayload = unknown>(type: string, payload?: TPayload): Promise<void> {
			this.restoreWebSocketIfNeeded();
			this.sendToWebSocket(`system:${type}`, payload);
		}

		/**
		 * Get the userId this connection belongs to
		 */
		async getUserId(): Promise<string | null> {
			return this[META]?.userId ?? null;
		}

		/**
		 * Check if this connection is active
		 */
		async isConnected(): Promise<boolean> {
			return this[WS] !== null && this[WS].readyState === WebSocket.OPEN;
		}

		/**
		 * Join a room (register with RoomDO)
		 * Room membership and metadata are persisted to survive hibernation
		 */
		async joinRoom(roomName: string, metadata?: Record<string, unknown>): Promise<void> {
			if (!this[META]) {
				throw new Error("Cannot join room: not connected");
			}

			const RoomDO = this.getRoomBinding(roomName);
			const roomStub = RoomDO.get(RoomDO.idFromName(roomName)) as RoomActorStub;
			await roomStub.join(this[META].userId, metadata);

			this[ROOMS].set(roomName, metadata);
			await this.persistRooms();
		}

		/**
		 * Persist rooms to storage (internal helper)
		 */
		private async persistRooms(): Promise<void> {
			const storedRooms: StoredRoom[] = Array.from(this[ROOMS].entries()).map(
				([roomName, metadata]) => ({ roomName, metadata })
			);
			await this.ctx.storage.put("_connection_rooms", storedRooms);
		}

		/**
		 * Re-register with all rooms after hibernation wake
		 * This ensures RoomDOs know this connection is still active
		 */
		private async rejoinRoomsAfterHibernation(): Promise<void> {
			if (this[ROOMS].size === 0) return;

			const userId = this[META]?.userId;
			if (!userId) return;

			const failedRooms: string[] = [];

			for (const [roomName, metadata] of this[ROOMS].entries()) {
				try {
					const RoomDO = this.getRoomBinding(roomName);
					const roomStub = RoomDO.get(roomName) as RoomActorStub;
					await roomStub.join(userId, metadata);
				} catch {
					failedRooms.push(roomName);
				}
			}

			if (failedRooms.length > 0) {
				for (const roomName of failedRooms) {
					this[ROOMS].delete(roomName);
				}
				await this.persistRooms();
			}
		}

		/**
		 * Leave a room (internal, doesn't notify RoomDO)
		 */
		private async leaveRoomInternal(roomName: string): Promise<void> {
			if (!this[META]) return;

			const RoomDO = this.getRoomBinding(roomName);
			const roomStub = RoomDO.get(RoomDO.idFromName(roomName)) as RoomActorStub;
			await roomStub.leave(this[META].userId);
		}

		/**
		 * Leave a room (unregister from RoomDO)
		 */
		async leaveRoom(roomName: string): Promise<void> {
			if (!this[META]) {
				throw new Error("Cannot leave room: not connected");
			}

			await this.leaveRoomInternal(roomName);

			this[ROOMS].delete(roomName);
			await this.persistRooms();
		}

		/**
		 * Get list of rooms this connection is a member of
		 */
		async getRooms(): Promise<string[]> {
			return Array.from(this[ROOMS].keys());
		}

		/**
		 * Get Durable Object storage
		 */
		getStorage(): DurableObjectStorage {
			return this.ctx.storage;
		}

		/**
		 * Register an event handler (socket.io-like)
		 */
		on<TData = unknown>(event: string, handler: (ctx: ConnectionContext<TMeta, E, TState>, data: TData) => void | Promise<void>): void {
			this.handlers.set(event, handler as (ctx: ConnectionContext<TMeta, E, TState>, data: unknown) => void | Promise<void>);
		}

		/**
		 * Remove an event handler
		 */
		off(event: string): void {
			this.handlers.delete(event);
		}

		/**
		 * Clean shutdown: leave all rooms, close WebSocket, call hook, then clear storage
		 */
		async destroy() {
			for (const roomName of this[ROOMS].keys()) {
				try {
					await this.leaveRoomInternal(roomName);
				} catch {
					// RPC failure during destroy — non-fatal
				}
			}

			if (this[WS] && this[WS].readyState === WebSocket.OPEN) {
				this[WS].close(1000, "Actor destroyed");
			}

			if (definition.onDestroy && this[META]) {
				await definition.onDestroy(this.createContext());
			}

			await super.destroy();
		}
	}

	// Set the name property for proper Actor binding resolution
	Object.defineProperty(NamedConnectionClass, "name", {
		value: className,
		writable: false,
		configurable: true
	});

	return NamedConnectionClass as unknown as ConnectionHandlerClass<E>;
}

/**
 * Helper to define a connection with socket.io-like event handlers
 */
export interface ConnectionDefinitionWithHandlers<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
> extends ConnectionDefinition<TMeta, E, TState> {
	on<TData = unknown>(event: string, handler: (ctx: ConnectionContext<TMeta, E, TState>, data: TData) => void | Promise<void>): void;
	off(event: string): void;
}

/**
 * Define a connection with socket.io-like convenience methods
 */
export function defineConnection<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
>(
	def: ConnectionDefinition<TMeta, E, TState>
): ConnectionDefinitionWithHandlers<TMeta, E, TState> {
	const handlers = new Map<string, (ctx: ConnectionContext<TMeta, E, TState>, data: unknown) => void | Promise<void>>();

	return {
		...def,
		handlers,
		on<TData = unknown>(event: string, handler: (ctx: ConnectionContext<TMeta, E, TState>, data: TData) => void | Promise<void>): void {
			handlers.set(event, handler as (ctx: ConnectionContext<TMeta, E, TState>, data: unknown) => void | Promise<void>);
		},
		off(event: string): void {
			handlers.delete(event);
		}
	};
}
