import { Actor, ActorConfiguration } from "@cloudflare/actors";
import type { RoomDefinition, BroadcastOptions, ConnectionMeta, ActorStub } from "./types";
import { cleanupStaleSessions as cleanupStaleSessionsImpl } from "./runtime/cleanupStaleSessions";
import { broadcast as broadcastImpl } from "./runtime/broadcast";
import { sendToUser as sendToUserImpl } from "./runtime/sendToUser";
import { getSessionCount as getSessionCountImpl, getConnectedUserIds as getConnectedUserIdsImpl, getUserSessions as getUserSessionsImpl, getStorage as getStorageImpl } from "./runtime/helpers";
import { sanitizeToClassName } from "./runtime/sanitizeToClassName";
import { createConfiguration } from "./runtime/configuration";
import { onInit as onInitImpl } from "./runtime/onInit";
import { onWebSocketConnect as onWebSocketConnectImpl } from "./runtime/onWebSocketConnect";
import { onWebSocketMessage as onWebSocketMessageImpl } from "./runtime/onWebSocketMessage";
import { onWebSocketDisconnect as onWebSocketDisconnectImpl } from "./runtime/onWebSocketDisconnect";
import { createActorEmit } from "./runtime/emit";
import { createFetch, type ActorInstanceWithFetchMethods } from "./runtime/fetch";
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
 * Return type for createActorHandler - represents an Actor class constructor
 */
export type ActorHandlerClass<E = unknown> = {
	new(state: any, env: E): Actor<E>;
	get(id: string): ActorStub;
	configuration(request?: Request): ActorConfiguration;
};

/**
 * Creates an Actor handler from a room definition
 * @param room - The room definition with lifecycle hooks
 * @returns Actor class for Cloudflare Workers (extends DurableObject)
 */
export function createActorHandler<
	TMeta extends ConnectionMeta = ConnectionMeta,
	E = unknown,
	TState extends Record<string, unknown> = Record<string, unknown>
>(
	room: RoomDefinition<TMeta, E, TState>
): ActorHandlerClass<E> {
	// Determine class name with priority: room.name > room.websocketPath > "VeraniActor"
	const className = sanitizeToClassName(room.name || room.websocketPath || "VeraniActor");

	// Cast room for runtime helpers that don't need TState
	const roomDef = room as RoomDefinition<TMeta, E>;

	// Create named class dynamically
	class NamedActorClass extends Actor<E> {
		sessions = new Map<WebSocket, { ws: WebSocket; meta: TMeta }>();
		emit = createActorEmit<TMeta, E>(this as any);

		// State persistence support
		[STATE_READY] = false;
		[PERSISTED_STATE]: Record<string, unknown> = {};

		/**
		 * User-defined persisted state for this actor.
		 * Access this after onInit completes. Changes to tracked keys are automatically persisted.
		 */
		get roomState(): Record<string, unknown> {
			return this[PERSISTED_STATE];
		}

		/**
		 * Check if the persisted state has been initialized.
		 * Returns true after onInit completes and state is loaded from storage.
		 */
		isStateReady(): boolean {
			return checkStateReady(this as unknown as PersistableActor);
		}

		/**
		 * Static configuration method for Cloudflare Actors
		 * Specifies WebSocket upgrade path and other options
		 */
		static configuration = createConfiguration(roomDef);

		protected async shouldUpgradeWebSocket(request: Request): Promise<boolean> {
			return true;
		}


		// https://github.com/cloudflare/actors/issues/92
		fetch = createFetch(roomDef, this as unknown as ActorInstanceWithFetchMethods);


	/**
	 * Called when the Actor initializes or wakes from hibernation
	 * Restores sessions from WebSocket attachments and initializes persisted state
	 */
	protected async onInit() {
		// Initialize persisted state if room defines state
		if (room.state) {
			// Set error handler if defined
			if (room.onPersistError) {
				setPeristErrorHandler(
					this as unknown as PersistableActor,
					room.onPersistError
				);
			}

			// Initialize state from storage
			const persistedKeys = room.persistedKeys as string[] | undefined;
			const initializedState = await initializePersistedState(
				this as unknown as PersistableActor,
				room.state,
				persistedKeys,
				room.persistOptions
			);

			this[PERSISTED_STATE] = initializedState;
			console.debug(`[Verani:Persist] State initialized with keys: ${Object.keys(initializedState).join(', ')}`);
		}

		// Call the original onInit implementation
		await onInitImpl(this, roomDef);
	}

	/**
	 * Called when a new WebSocket connection is established
	 */
	protected async onWebSocketConnect(ws: WebSocket, req: Request) {
		await onWebSocketConnectImpl(this, roomDef, ws, req);
	}

	/**
	 * Called when a message is received from a WebSocket
	 */
	protected async onWebSocketMessage(ws: WebSocket, raw: any) {
		await onWebSocketMessageImpl(this, roomDef, ws, raw);
	}

	/**
	 * Called when a WebSocket connection is closed
	 */
	protected async onWebSocketDisconnect(ws: WebSocket) {
		await onWebSocketDisconnectImpl(this, roomDef, ws);
	}

	/**
	 * Removes all WebSocket sessions that are not in OPEN state
	 * This prevents stale connections from accumulating in memory
	 * @returns Number of sessions cleaned up
	 */
	cleanupStaleSessions(): number {
		return cleanupStaleSessionsImpl(this.sessions);
	}

	/**
	 * @deprecated Use `emit()` or `toChannel().emit()` instead for Socket.IO-like API.
	 * Broadcasts a message to all connections in a channel
	 * @param channel - The channel to broadcast to
	 * @param data - The data to send
	 * @param opts - Broadcast options (filtering, exclusions)
	 * @returns Number of connections that received the message
	 */
	broadcast(channel: string, data: any, opts?: BroadcastOptions): number {
		return broadcastImpl(this.sessions, channel, data, opts);
	}

	/**
	 * Gets the total number of active sessions
	 * @returns Number of connected WebSockets
	 */
	getSessionCount(): number {
		return getSessionCountImpl(this.sessions);
	}

	/**
	 * Gets all unique user IDs currently connected
	 * @returns Array of unique user IDs
	 */
	getConnectedUserIds(): string[] {
		return getConnectedUserIdsImpl(this.sessions);
	}

	/**
	 * Gets all sessions for a specific user
	 * @param userId - The user ID to filter by
	 * @returns Array of WebSockets belonging to the user
	 */
	getUserSessions(userId: string): WebSocket[] {
		return getUserSessionsImpl(this.sessions, userId);
	}

	/**
	 * @deprecated Use `toUser().emit()` instead for Socket.IO-like API.
	 * Sends a message to a specific user (all their sessions)
	 * @param userId - The user ID to send to
	 * @param channel - The channel to send to
	 * @param data - Message data
	 * @returns Number of sessions that received the message
	 */
	sendToUser(userId: string, channel: string, data?: any): number {
		return sendToUserImpl(this.sessions, userId, channel, data);
	}

	/**
	 * Socket.IO-like emit API: Emit an event to a specific channel.
	 * Available via RPC.
	 * @param channel - Channel name
	 * @param event - Event name
	 * @param data - Event data
	 * @returns Number of connections that received the message
	 * @example
	 * ```typescript
	 * // Direct call (inside lifecycle hooks)
	 * const sent = actor.emitToChannel("default", "announcement", { text: "Hello!" });
	 *
	 * // RPC call (from Worker)
	 * const sent = await stub.emitToChannel("default", "announcement", { text: "Hello!" });
	 * ```
	 */
	emitToChannel(channel: string, event: string, data?: any): number {
		const eventData = { type: event, ...data };
		return broadcastImpl(this.sessions, channel, eventData);
	}

	/**
	 * Socket.IO-like emit API: Emit an event to a specific user (all their sessions).
	 * Available via RPC.
	 * Sends to ALL sessions of the user, regardless of which channels they're subscribed to.
	 * @param userId - User ID
	 * @param event - Event name
	 * @param data - Event data
	 * @returns Number of sessions that received the message
	 * @example
	 * ```typescript
	 * // Direct call (inside lifecycle hooks)
	 * const sent = actor.emitToUser("alice", "notification", { message: "Hello!" });
	 *
	 * // RPC call (from Worker)
	 * const sent = await stub.emitToUser("alice", "notification", { message: "Hello!" });
	 * ```
	 */
	emitToUser(userId: string, event: string, data?: any): number {
		const eventData = { type: event, ...data };
		const frame = { type: "event" as const, channel: "default", data: eventData };
		const encoded = encodeFrame(frame);

		let sentCount = 0;
		const failedSessions: WebSocket[] = [];

		// Send to ALL sessions of this user, regardless of channel
		for (const { ws, meta } of this.sessions.values()) {
			if (meta.userId === userId) {
				if (ws.readyState !== WebSocket.OPEN) {
					failedSessions.push(ws);
					continue;
				}

				try {
					ws.send(encoded);
					sentCount++;
				} catch (error) {
					console.error("[Verani] Failed to send to user:", error);
					failedSessions.push(ws);
				}
			}
		}

		// Clean up failed sessions
		for (const ws of failedSessions) {
			this.sessions.delete(ws);
		}

		return sentCount;
	}

	/**
	 * Gets the Durable Object storage interface
	 * @returns DurableObjectStorage instance
	 */
	getStorage(): DurableObjectStorage {
		return getStorageImpl(this.ctx);
	}
	};

	// Set the name property for proper Actor binding resolution
	Object.defineProperty(NamedActorClass, 'name', {
		value: className,
		writable: false,
		configurable: true
	});

	return NamedActorClass as unknown as ActorHandlerClass<E>;
}
