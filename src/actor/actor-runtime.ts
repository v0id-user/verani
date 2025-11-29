import { Actor, ActorConfiguration } from "@cloudflare/actors";
import type { RoomDefinition, BroadcastOptions, RpcBroadcastOptions, ConnectionMeta } from "./types";
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


/**
 * Actor stub interface returned by .get() method.
 * Provides RPC access to actor methods that can be called remotely.
 *
 * Note: RPC methods return Promises even if the underlying method is synchronous.
 * Methods that return non-serializable types (like WebSocket[] or DurableObjectStorage)
 * are excluded from this interface.
 */
export interface ActorStub {
	/**
	 * Standard fetch method for handling HTTP requests and WebSocket upgrades
	 */
	fetch(request: Request): Promise<Response>;

	/**
	 * Sends a message to a specific user (all their sessions) via RPC.
	 * @param userId - The user ID to send to
	 * @param channel - The channel to send to
	 * @param data - Message data
	 * @returns Promise resolving to the number of sessions that received the message
	 */
	sendToUser(userId: string, channel: string, data?: any): Promise<number>;

	/**
	 * Broadcasts a message to all connections in a channel via RPC.
	 * Note: The `except` option from BroadcastOptions is not available over RPC
	 * since WebSocket cannot be serialized.
	 * @param channel - The channel to broadcast to
	 * @param data - The data to send
	 * @param opts - Broadcast options (filtering by userIds or clientIds)
	 * @returns Promise resolving to the number of connections that received the message
	 */
	broadcast(channel: string, data: any, opts?: RpcBroadcastOptions): Promise<number>;

	/**
	 * Gets the total number of active sessions via RPC.
	 * @returns Promise resolving to the number of connected WebSockets
	 */
	getSessionCount(): Promise<number>;

	/**
	 * Gets all unique user IDs currently connected via RPC.
	 * @returns Promise resolving to an array of unique user IDs
	 */
	getConnectedUserIds(): Promise<string[]>;

	/**
	 * Removes all WebSocket sessions that are not in OPEN state via RPC.
	 * This prevents stale connections from accumulating in memory.
	 * @returns Promise resolving to the number of sessions cleaned up
	 */
	cleanupStaleSessions(): Promise<number>;
}

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
export function createActorHandler<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>(
	room: RoomDefinition<TMeta, E>
): ActorHandlerClass<E> {
	// Determine class name with priority: room.name > room.websocketPath > "VeraniActor"
	const className = sanitizeToClassName(room.name || room.websocketPath || "VeraniActor");

	// Create named class dynamically
	class NamedActorClass extends Actor<E> {
		sessions = new Map<WebSocket, { ws: WebSocket; meta: TMeta }>();
		emit = createActorEmit<TMeta, E>(this as any);

		/**
		 * Static configuration method for Cloudflare Actors
		 * Specifies WebSocket upgrade path and other options
		 */
		static configuration = createConfiguration(room);

		protected async shouldUpgradeWebSocket(request: Request): Promise<boolean> {
			return true;
		}

		// https://github.com/cloudflare/actors/issues/92
		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);
			const upgradeHeader = request.headers.get("Upgrade");

			if (url.pathname === room.websocketPath && upgradeHeader === 'websocket') {
				const shouldUpgrade = await this.shouldUpgradeWebSocket(request);
				if (shouldUpgrade) {
					return this.onWebSocketUpgrade(request);
				}
			}

			return this.onRequest(request);
		}


	/**
	 * Called when the Actor initializes or wakes from hibernation
	 * Restores sessions from WebSocket attachments
	 */
	protected async onInit() {
		await onInitImpl(this, room);
	}

	/**
	 * Called when a new WebSocket connection is established
	 */
	protected async onWebSocketConnect(ws: WebSocket, req: Request) {
		await onWebSocketConnectImpl(this, room, ws, req);
	}

	/**
	 * Called when a message is received from a WebSocket
	 */
	protected async onWebSocketMessage(ws: WebSocket, raw: any) {
		await onWebSocketMessageImpl(this, room, ws, raw);
	}

	/**
	 * Called when a WebSocket connection is closed
	 */
	protected async onWebSocketDisconnect(ws: WebSocket) {
		await onWebSocketDisconnectImpl(this, room, ws);
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
