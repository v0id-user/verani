import { Actor } from "@cloudflare/actors";
import type { RoomCoordinatorDefinition, RoomMember, BroadcastOptions, ConnectionDOBinding } from "./types";

/**
 * Symbol keys for internal state
 */
const MEMBERS = Symbol("MEMBERS");
const ROOM_NAME = Symbol("ROOM_NAME");
const DELIVERY_FAILURES = Symbol("DELIVERY_FAILURES");

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
	broadcast<TData = unknown>(event: string, data?: TData, opts?: BroadcastOptions): Promise<number>;

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
		 * Consecutive delivery failure count per member
		 */
		[DELIVERY_FAILURES] = new Map<string, number>();

		/**
		 * Room-level shared state
		 */
		private roomState: Record<string, unknown> = {};

		/**
		 * Get ConnectionDO binding from environment for RPC calls
		 */
		private getConnectionBinding(): ConnectionDOBinding {
			if (!definition.connectionBinding) {
				throw new Error(
					`Cannot resolve ConnectionDO: no "connectionBinding" provided in RoomCoordinatorDefinition. ` +
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
		 * Called when the DO initializes or wakes from hibernation
		 */
		protected async onInit() {
			this.ensureTables();
			await this.migrateFromKV();
			this.loadMembers();
			this.loadRoomState();

			if (definition.onInit) {
				await definition.onInit(this.roomState);
			}
		}

		/**
		 * Create SQL tables if they don't exist
		 */
		private ensureTables(): void {
			this.sql`CREATE TABLE IF NOT EXISTS room_members (
				user_id TEXT PRIMARY KEY,
				joined_at INTEGER NOT NULL,
				metadata TEXT
			)`;
			this.sql`CREATE TABLE IF NOT EXISTS room_state (
				key TEXT PRIMARY KEY,
				value TEXT
			)`;
		}

		/**
		 * One-time migration from KV to SQL for existing deployments
		 */
		private async migrateFromKV(): Promise<void> {
			const storage = this.ctx.storage;

			const memberList = await storage.list<RoomMember>({ prefix: "_room_member:" });
			if (memberList.size > 0) {
				for (const [key, member] of memberList.entries()) {
					const userId = key.replace("_room_member:", "");
					const metadata = member.metadata ? JSON.stringify(member.metadata) : null;
					this.sql`INSERT OR REPLACE INTO room_members (user_id, joined_at, metadata)
						VALUES (${userId}, ${member.joinedAt}, ${metadata})`;
				}
				await storage.delete(Array.from(memberList.keys()));
			}

			const stateMap = await storage.list<unknown>({ prefix: "_room_state:" });
			if (stateMap.size > 0) {
				for (const [key, value] of stateMap.entries()) {
					const stateKey = key.replace("_room_state:", "");
					this.sql`INSERT OR REPLACE INTO room_state (key, value)
						VALUES (${stateKey}, ${JSON.stringify(value)})`;
				}
				await storage.delete(Array.from(stateMap.keys()));
			}
		}

		/**
		 * Load members from SQL into memory
		 */
		private loadMembers(): void {
			this[MEMBERS].clear();
			const rows = this.sql`SELECT user_id, joined_at, metadata FROM room_members` as
				{ user_id: string; joined_at: number; metadata: string | null }[];
			for (const row of rows) {
				this[MEMBERS].set(row.user_id, {
					userId: row.user_id,
					joinedAt: row.joined_at,
					metadata: row.metadata ? JSON.parse(row.metadata) : undefined
				});
			}
		}

		/**
		 * Load room state from SQL into memory
		 */
		private loadRoomState(): void {
			this.roomState = {};
			const rows = this.sql`SELECT key, value FROM room_state` as
				{ key: string; value: string }[];
			for (const row of rows) {
				this.roomState[row.key] = JSON.parse(row.value);
			}
		}

		/**
		 * Add a user to this room
		 */
		async join(userId: string, metadata: Record<string, unknown> = {}): Promise<void> {
			const joinedAt = Date.now();
			const member: RoomMember = { userId, joinedAt, metadata };
			const metadataJson = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

			this[MEMBERS].set(userId, member);
			this.sql`INSERT OR REPLACE INTO room_members (user_id, joined_at, metadata)
				VALUES (${userId}, ${joinedAt}, ${metadataJson})`;

			if (definition.onJoin) {
				await definition.onJoin(this.roomState, userId, metadata);
			}
		}

		/**
		 * Remove a user from this room
		 */
		async leave(userId: string): Promise<void> {
			if (!this[MEMBERS].has(userId)) return;

			this[MEMBERS].delete(userId);
			this.sql`DELETE FROM room_members WHERE user_id = ${userId}`;

			if (definition.onLeave) {
				await definition.onLeave(this.roomState, userId);
			}
		}

		/**
		 * Broadcast a message to all members in the room via RPC to their ConnectionDOs
		 *
		 * @param event - Event name
		 * @param data - Event data
		 * @param opts - Broadcast options (exclude specific users, etc.)
		 * @returns Number of members the message was sent to
		 */
		async broadcast<TData = unknown>(event: string, data?: TData, opts?: BroadcastOptions): Promise<number> {
			const ConnectionDO = this.getConnectionBinding();

			const eligible = Array.from(this[MEMBERS].entries()).filter(([userId]) => {
				if (opts?.userIds && !opts.userIds.includes(userId)) return false;
				if (opts?.exceptUserId === userId) return false;
				return true;
			});

			const results = await Promise.all(
				eligible.map(async ([userId]): Promise<{ userId: string; ok: boolean; error?: Error }> => {
					try {
						const connectionStub = ConnectionDO.get(ConnectionDO.idFromName(userId));
						await connectionStub.deliverMessage(event, data);
						return { userId, ok: true };
					} catch (error) {
						return { userId, ok: false, error: error as Error };
					}
				})
			);

			const maxFailures = definition.maxDeliveryFailures ?? 3;
			let sentCount = 0;
			const staleMembers: string[] = [];

			for (const result of results) {
				if (result.ok) {
					sentCount++;
					this[DELIVERY_FAILURES].delete(result.userId);
				} else {
					const failures = (this[DELIVERY_FAILURES].get(result.userId) ?? 0) + 1;
					this[DELIVERY_FAILURES].set(result.userId, failures);
					if (failures >= maxFailures) {
						staleMembers.push(result.userId);
					}
				}
			}

			for (const userId of staleMembers) {
				this[DELIVERY_FAILURES].delete(userId);
				await this.leave(userId);
			}

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
			if (!member) return;

			member.metadata = { ...member.metadata, ...metadata };
			this[MEMBERS].set(userId, member);
			const metadataJson = JSON.stringify(member.metadata);
			this.sql`UPDATE room_members SET metadata = ${metadataJson} WHERE user_id = ${userId}`;
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
			const valueJson = JSON.stringify(value);
			this.sql`INSERT OR REPLACE INTO room_state (key, value) VALUES (${key}, ${valueJson})`;
		}

		/**
		 * Clean shutdown: call hook, then clear storage
		 */
		async destroy() {
			if (definition.onDestroy) {
				await definition.onDestroy(this.roomState);
			}
			await super.destroy();
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
