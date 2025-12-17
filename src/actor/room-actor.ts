import { Actor } from "@cloudflare/actors";
import type { RoomCoordinatorDefinition, RoomMember, BroadcastOptions } from "./types";

/**
 * Symbol keys for internal state
 */
const MEMBERS = Symbol("MEMBERS");
const ROOM_NAME = Symbol("ROOM_NAME");

/**
 * RoomDO - Coordination Durable Object for managing room membership and message fanout.
 *
 * This DO does NOT hold any WebSocket connections. Instead, it:
 * - Manages a set of member userIds
 * - Routes broadcast messages to member ConnectionDOs via RPC
 * - Persists membership across hibernation
 *
 * One RoomDO instance per room/channel (e.g., RoomDO.get("chat"), RoomDO.get("presence"))
 */
export interface RoomActorStub {
	/**
	 * Add a user to this room
	 */
	join(userId: string, metadata?: Record<string, unknown>): Promise<void>;

	/**
	 * Remove a user from this room
	 */
	leave(userId: string): Promise<void>;

	/**
	 * Broadcast a message to all members in the room
	 * This triggers RPC calls to each member's ConnectionDO
	 */
	broadcast(event: string, data?: any, opts?: BroadcastOptions): Promise<number>;

	/**
	 * Get all current members of the room
	 */
	getMembers(): Promise<RoomMember[]>;

	/**
	 * Get the count of members in the room
	 */
	getMemberCount(): Promise<number>;

	/**
	 * Check if a user is a member of this room
	 */
	hasMember(userId: string): Promise<boolean>;

	/**
	 * Update metadata for a member
	 */
	updateMemberMetadata(userId: string, metadata: Record<string, unknown>): Promise<void>;

	/**
	 * Get room state (for coordination purposes)
	 */
	getRoomState(): Promise<Record<string, unknown>>;

	/**
	 * Set room state (for coordination purposes)
	 */
	setRoomState(key: string, value: unknown): Promise<void>;
}

/**
 * Return type for createRoomHandler - represents a RoomDO class constructor
 */
export type RoomHandlerClass<E = unknown> = {
	new(state: any, env: E): Actor<E>;
	get(roomName: string): RoomActorStub;
};

/**
 * Creates a Room coordination handler (Durable Object)
 *
 * This creates a DO class that manages room membership and coordinates
 * message delivery between ConnectionDOs via RPC.
 *
 * @param definition - Room coordinator definition with optional hooks
 * @returns RoomDO class for Cloudflare Workers
 *
 * @example
 * ```typescript
 * const ChatRoom = createRoomHandler({
 *   name: "chat-room",
 *   onJoin: async (roomState, userId, metadata) => {
 *     console.log(`${userId} joined the chat`);
 *   },
 *   onLeave: async (roomState, userId) => {
 *     console.log(`${userId} left the chat`);
 *   }
 * });
 *
 * // In wrangler.toml, bind this as a separate DO
 * // Then use: ChatRoom.get("general").join(userId)
 * ```
 */
export function createRoomHandler<E = unknown>(
	definition: RoomCoordinatorDefinition<E> = {}
): RoomHandlerClass<E> {
	const className = definition.name || "VeraniRoomDO";

	class NamedRoomClass extends Actor<E> {
		/**
		 * In-memory member set (restored from storage on wake)
		 * Map<userId, RoomMember>
		 */
		[MEMBERS] = new Map<string, RoomMember>();

		/**
		 * Room name (set from the ID used to get this DO)
		 */
		[ROOM_NAME]: string = "";

		/**
		 * Room-level shared state
		 */
		private roomState: Record<string, unknown> = {};

		/**
		 * Reference to ConnectionDO class for RPC calls
		 * This will be injected via environment bindings
		 */
		private getConnectionDO(): any {
			// Access the ConnectionDO binding from environment
			// The binding name should match wrangler.toml configuration
			const env = this.env as any;
			return env.CONNECTION_DO || env.ConnectionDO || env.VERANI_CONNECTION;
		}

		/**
		 * Called when the DO initializes or wakes from hibernation
		 */
		protected async onInit() {
			console.debug("[Verani:RoomDO] onInit called");

			// Restore members from storage
			await this.restoreMembersFromStorage();

			// Restore room state from storage
			await this.restoreRoomStateFromStorage();

			// Call user-defined onInit hook
			if (definition.onInit) {
				await definition.onInit(this.roomState);
			}

			console.debug(`[Verani:RoomDO] Initialized with ${this[MEMBERS].size} members`);
		}

		/**
		 * Restore member list from Durable Object storage
		 */
		private async restoreMembersFromStorage(): Promise<void> {
			const storage = this.ctx.storage;
			const memberList = await storage.list<RoomMember>({ prefix: "_room_member:" });

			this[MEMBERS].clear();
			for (const [key, member] of memberList.entries()) {
				const userId = key.replace("_room_member:", "");
				this[MEMBERS].set(userId, member);
			}

			console.debug(`[Verani:RoomDO] Restored ${this[MEMBERS].size} members from storage`);
		}

		/**
		 * Restore room state from storage
		 */
		private async restoreRoomStateFromStorage(): Promise<void> {
			const storage = this.ctx.storage;
			const stateMap = await storage.list<unknown>({ prefix: "_room_state:" });

			this.roomState = {};
			for (const [key, value] of stateMap.entries()) {
				const stateKey = key.replace("_room_state:", "");
				this.roomState[stateKey] = value;
			}

			console.debug(`[Verani:RoomDO] Restored room state with ${Object.keys(this.roomState).length} keys`);
		}

		/**
		 * Add a user to this room
		 */
		async join(userId: string, metadata: Record<string, unknown> = {}): Promise<void> {
			console.debug(`[Verani:RoomDO] User ${userId} joining room`);

			const member: RoomMember = {
				userId,
				joinedAt: Date.now(),
				metadata
			};

			// Store in memory
			this[MEMBERS].set(userId, member);

			// Persist to storage
			await this.ctx.storage.put(`_room_member:${userId}`, member);

			// Call user-defined onJoin hook
			if (definition.onJoin) {
				await definition.onJoin(this.roomState, userId, metadata);
			}

			console.debug(`[Verani:RoomDO] User ${userId} joined, total members: ${this[MEMBERS].size}`);
		}

		/**
		 * Remove a user from this room
		 */
		async leave(userId: string): Promise<void> {
			console.debug(`[Verani:RoomDO] User ${userId} leaving room`);

			const member = this[MEMBERS].get(userId);
			if (!member) {
				console.debug(`[Verani:RoomDO] User ${userId} was not in room`);
				return;
			}

			// Remove from memory
			this[MEMBERS].delete(userId);

			// Remove from storage
			await this.ctx.storage.delete(`_room_member:${userId}`);

			// Call user-defined onLeave hook
			if (definition.onLeave) {
				await definition.onLeave(this.roomState, userId);
			}

			console.debug(`[Verani:RoomDO] User ${userId} left, remaining members: ${this[MEMBERS].size}`);
		}

		/**
		 * Broadcast a message to all members in the room via RPC to their ConnectionDOs
		 *
		 * @param event - Event name
		 * @param data - Event data
		 * @param opts - Broadcast options (exclude specific users, etc.)
		 * @returns Number of members the message was sent to
		 */
		async broadcast(event: string, data?: any, opts?: BroadcastOptions): Promise<number> {
			console.debug(`[Verani:RoomDO] Broadcasting "${event}" to ${this[MEMBERS].size} members`);

			const ConnectionDO = this.getConnectionDO();
			if (!ConnectionDO) {
				console.error("[Verani:RoomDO] ConnectionDO binding not found in environment");
				return 0;
			}

			let sentCount = 0;
			const errors: Error[] = [];

			// Iterate through members and send via RPC
			for (const [userId, member] of this[MEMBERS].entries()) {
				// Skip if userIds filter is specified and doesn't match
				if (opts?.userIds && !opts.userIds.includes(userId)) {
					continue;
				}

				// Skip excluded user
				if (opts?.exceptUserId === userId) {
					continue;
				}

				try {
					// Get the user's ConnectionDO and call deliverMessage via RPC
					const connectionStub = ConnectionDO.get(userId);
					await connectionStub.deliverMessage(event, data);
					sentCount++;
				} catch (error) {
					console.error(`[Verani:RoomDO] Failed to deliver to ${userId}:`, error);
					errors.push(error as Error);

					// If the connection is gone, remove them from the room
					if ((error as Error).message?.includes("not found") ||
						(error as Error).message?.includes("no connection")) {
						console.debug(`[Verani:RoomDO] Removing stale member ${userId}`);
						await this.leave(userId);
					}
				}
			}

			console.debug(`[Verani:RoomDO] Broadcast complete, sent to ${sentCount}/${this[MEMBERS].size} members`);
			return sentCount;
		}

		/**
		 * Get all current members of the room
		 */
		async getMembers(): Promise<RoomMember[]> {
			return Array.from(this[MEMBERS].values());
		}

		/**
		 * Get the count of members in the room
		 */
		async getMemberCount(): Promise<number> {
			return this[MEMBERS].size;
		}

		/**
		 * Check if a user is a member of this room
		 */
		async hasMember(userId: string): Promise<boolean> {
			return this[MEMBERS].has(userId);
		}

		/**
		 * Update metadata for a member
		 */
		async updateMemberMetadata(userId: string, metadata: Record<string, unknown>): Promise<void> {
			const member = this[MEMBERS].get(userId);
			if (!member) {
				console.warn(`[Verani:RoomDO] Cannot update metadata for non-member: ${userId}`);
				return;
			}

			member.metadata = { ...member.metadata, ...metadata };
			this[MEMBERS].set(userId, member);

			// Persist update
			await this.ctx.storage.put(`_room_member:${userId}`, member);

			console.debug(`[Verani:RoomDO] Updated metadata for ${userId}`);
		}

		/**
		 * Get room state
		 */
		async getRoomState(): Promise<Record<string, unknown>> {
			return { ...this.roomState };
		}

		/**
		 * Set a room state value
		 */
		async setRoomState(key: string, value: unknown): Promise<void> {
			this.roomState[key] = value;
			await this.ctx.storage.put(`_room_state:${key}`, value);
			console.debug(`[Verani:RoomDO] Set room state "${key}"`);
		}
	}

	// Set the name property for proper Actor binding resolution
	Object.defineProperty(NamedRoomClass, 'name', {
		value: className,
		writable: false,
		configurable: true
	});

	return NamedRoomClass as unknown as RoomHandlerClass<E>;
}
