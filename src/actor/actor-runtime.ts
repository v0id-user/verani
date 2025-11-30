import { Actor, ActorConfiguration } from "@cloudflare/actors";
import type { RoomDefinition, BroadcastOptions, RpcBroadcastOptions, ConnectionMeta, RpcEmitBuilder } from "./types";
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
import { createRpcChannelEmitBuilder, createRpcUserEmitBuilder, createRpcEmitBuilder } from "./runtime/rpc-emit";


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
	 * Socket.IO-like emit API: Get a builder for emitting to a specific channel.
	 * Use `toChannel("default").emit(event, data)` to emit to the default channel.
	 * @param channel - Channel name
	 * @returns Promise resolving to an emit builder
	 */
	toChannel(channel: string): Promise<RpcEmitBuilder>;

	/**
	 * Socket.IO-like emit API: Get a builder for emitting to a specific user.
	 * @param userId - User ID
	 * @returns Promise resolving to an emit builder
	 */
	toUser(userId: string): Promise<RpcEmitBuilder>;

	/**
	 * Socket.IO-like emit API: Get a builder with smart routing (channel or user).
	 * @param target - Channel name or user ID
	 * @returns Promise resolving to an emit builder
	 */
	to(target: string): Promise<RpcEmitBuilder>;

	/**
	 * @deprecated Use `emit()` or `toChannel().emit()` instead for Socket.IO-like API.
	 * Sends a message to a specific user (all their sessions) via RPC.
	 * @param userId - The user ID to send to
	 * @param channel - The channel to send to
	 * @param data - Message data
	 * @returns Promise resolving to the number of sessions that received the message
	 */
	sendToUser(userId: string, channel: string, data?: any): Promise<number>;

	/**
	 * @deprecated Use `emit()` or `toChannel().emit()` instead for Socket.IO-like API.
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
		fetch = createFetch(room, this as unknown as ActorInstanceWithFetchMethods);


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
	 * Available via RPC. Used internally by toChannel() builder.
	 * @param channel - Channel name
	 * @param event - Event name
	 * @param data - Event data
	 * @returns Number of connections that received the message
	 */
	emitToChannel(channel: string, event: string, data?: any): number {
		const eventData = { type: event, ...data };
		return broadcastImpl(this.sessions, channel, eventData);
	}

	/**
	 * Socket.IO-like emit API: Emit an event to a specific user.
	 * Available via RPC. Used internally by toUser() builder.
	 * @param userId - User ID
	 * @param event - Event name
	 * @param data - Event data
	 * @returns Number of sessions that received the message
	 */
	emitToUser(userId: string, event: string, data?: any): number {
		const eventData = { type: event, ...data };
		return sendToUserImpl(this.sessions, userId, "default", eventData);
	}

	/**
	 * Socket.IO-like emit API: Get a builder for emitting to a specific channel.
	 * Available via RPC.
	 * @param channel - Channel name
	 * @returns Emit builder for the channel
	 */
	toChannel(channel: string): RpcEmitBuilder {
		return createRpcChannelEmitBuilder(this as any, channel);
	}

	/**
	 * Socket.IO-like emit API: Get a builder for emitting to a specific user.
	 * Available via RPC.
	 * @param userId - User ID
	 * @returns Emit builder for the user
	 */
	toUser(userId: string): RpcEmitBuilder {
		return createRpcUserEmitBuilder(this as any, userId);
	}

	/**
	 * Socket.IO-like emit API: Get a builder with smart routing (channel or user).
	 * Available via RPC.
	 * @param target - Channel name or user ID
	 * @returns Emit builder for the target
	 */
	to(target: string): RpcEmitBuilder {
		return createRpcEmitBuilder(this as any, target);
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
