import { encodeFrame } from "../protocol";
import type {
	SocketEmit,
	ActorEmit,
	EmitBuilder,
	MessageContext,
	VeraniActor,
	ConnectionMeta,
	BroadcastOptions,
	AsyncEmitBuilder,
	ConnectionEmit,
	ConnectionActorStub,
	RoomDOBinding,
	ConnectionDOBinding
} from "../types";
import type { RoomActorStub } from "../room-actor";
import { broadcast as broadcastImpl } from "./broadcast";
import { sendToUser as sendToUserImpl } from "./sendToUser";

// ============================================================================
// RPC-Based Emit Builders (New Architecture)
// ============================================================================

/**
 * Creates an async emit builder that targets a room via RPC
 * Used in the new per-connection DO architecture
 *
 * @param roomName - The room name to broadcast to
 * @param getRoomDO - Function to get RoomDO binding
 * @param exceptUserId - Optional userId to exclude from broadcast
 * @returns AsyncEmitBuilder with async emit() method
 */
export function createRpcRoomEmitBuilder(
	roomName: string,
	getRoomDO: () => RoomDOBinding | undefined,
	exceptUserId?: string
): AsyncEmitBuilder {
	return {
		async emit<TData = unknown>(event: string, data?: TData): Promise<number> {
			console.debug(`[Verani:Emit:RPC] Room emit: ${event} to room: ${roomName}`);

			const RoomDO = getRoomDO();
			if (!RoomDO) {
				console.error("[Verani:Emit:RPC] RoomDO binding not found");
				return 0;
			}

			try {
				const roomStub = RoomDO.get(roomName) as RoomActorStub;
				const opts: BroadcastOptions = exceptUserId ? { exceptUserId } : {};
				return await roomStub.broadcast(event, data, opts);
			} catch (error) {
				console.error(`[Verani:Emit:RPC] Failed to broadcast to room ${roomName}:`, error);
				return 0;
			}
		}
	};
}

/**
 * Creates an async emit builder that targets a user via RPC
 * Used in the new per-connection DO architecture
 *
 * @param userId - The user ID to send to
 * @param getConnectionDO - Function to get ConnectionDO binding
 * @returns AsyncEmitBuilder with async emit() method
 */
export function createRpcUserEmitBuilder(
	userId: string,
	getConnectionDO: () => ConnectionDOBinding | undefined
): AsyncEmitBuilder {
	return {
		async emit<TData = unknown>(event: string, data?: TData): Promise<number> {
			console.debug(`[Verani:Emit:RPC] User emit: ${event} to user: ${userId}`);

			const ConnectionDO = getConnectionDO();
			if (!ConnectionDO) {
				console.error("[Verani:Emit:RPC] ConnectionDO binding not found");
				return 0;
			}

			try {
				const userStub = ConnectionDO.get(userId) as ConnectionActorStub;
				const success = await userStub.deliverMessage(event, data);
				return success ? 1 : 0;
			} catch (error) {
				console.error(`[Verani:Emit:RPC] Failed to send to user ${userId}:`, error);
				return 0;
			}
		}
	};
}

/**
 * Creates a connection-level emit API for the new per-connection architecture
 * Routes to RoomDO or ConnectionDO via RPC
 *
 * @param ws - The WebSocket connection (may be null)
 * @param meta - Connection metadata
 * @param getRoomDO - Function to get RoomDO binding from environment
 * @param getConnectionDO - Function to get ConnectionDO binding from environment
 * @returns ConnectionEmit API
 */
export function createConnectionEmit<TMeta extends ConnectionMeta, E>(
	ws: WebSocket | null,
	meta: TMeta,
	getRoomDO: () => RoomDOBinding | undefined,
	getConnectionDO: () => ConnectionDOBinding | undefined
): ConnectionEmit<TMeta, E> {
	return {
		/**
		 * Emit to this connection's WebSocket
		 */
		emit<TData = unknown>(event: string, data?: TData): void {
			console.debug(`[Verani:Emit:Connection] Emit to self: ${event}`);

			if (!ws || ws.readyState !== WebSocket.OPEN) {
				console.warn(`[Verani:Emit:Connection] Cannot emit to closed socket: ${event}`);
				return;
			}

		try {
			const eventData = { type: event, ...(data as object) };
			const frame = { type: "event", channel: "default", data: eventData };
			ws.send(encodeFrame(frame));
		} catch (error) {
			console.error(`[Verani:Emit:Connection] Failed to emit to socket:`, error);
		}
	},

		/**
		 * Target a specific room or user for emitting
		 * @param target - Room name (if starts with "room:") or userId
		 */
		to(target: string): AsyncEmitBuilder {
			if (target.startsWith("room:")) {
				return createRpcRoomEmitBuilder(target.slice(5), getRoomDO, meta.userId);
			}
			// Default to user targeting
			return createRpcUserEmitBuilder(target, getConnectionDO);
		},

		/**
		 * Target a specific room for broadcasting
		 */
		toRoom(roomName: string): AsyncEmitBuilder {
			return createRpcRoomEmitBuilder(roomName, getRoomDO, meta.userId);
		},

		/**
		 * Target a specific user for direct messaging
		 */
		toUser(userId: string): AsyncEmitBuilder {
			return createRpcUserEmitBuilder(userId, getConnectionDO);
		}
	};
}

// ============================================================================
// Legacy Local Emit Builders (Old Architecture - Deprecated)
// These are kept for backward compatibility with the global router pattern.
// New code should use createConnectionEmit() with RPC-based routing.
// ============================================================================

/**
 * Creates an emit builder that targets a specific user.
 * Messages sent through this builder will be delivered to all sessions belonging to the user
 * that are subscribed to the specified channel.
 *
 * @deprecated Use createRpcUserEmitBuilder() for the new per-connection architecture
 * @param userId - The user ID to target
 * @param sessions - Map of WebSocket sessions
 * @param defaultChannel - The channel to send messages to
 * @returns EmitBuilder instance with emit() method
 */
function createUserEmitBuilder<TMeta extends ConnectionMeta, E>(
	userId: string,
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>,
	defaultChannel: string
): EmitBuilder<TMeta, E> {
	console.debug("[Verani:Emit] createUserEmitBuilder for userId:", userId, "channel:", defaultChannel);
	return {
		emit<TData = unknown>(event: string, data?: TData): number {
			console.debug("[Verani:Emit] User emit:", event, "to userId:", userId);
			const eventData = { type: event, ...(data as object) };
			return sendToUserImpl(sessions, userId, defaultChannel, eventData);
		}
	};
}

/**
 * Creates an emit builder that targets a specific channel.
 * Messages sent through this builder will be broadcast to all connections subscribed to the channel,
 * with optional filtering by userIds, clientIds, or exclusion of specific WebSockets.
 *
 * @deprecated Use createRpcRoomEmitBuilder() for the new per-connection architecture
 * @param channel - The channel name to broadcast to
 * @param sessions - Map of WebSocket sessions
 * @param opts - Optional broadcast options for filtering (userIds, clientIds, except)
 * @returns EmitBuilder instance with emit() method
 */
function createChannelEmitBuilder<TMeta extends ConnectionMeta, E>(
	channel: string,
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>,
	opts?: BroadcastOptions
): EmitBuilder<TMeta, E> {
	console.debug("[Verani:Emit] createChannelEmitBuilder for channel:", channel, "options:", opts);
	return {
		emit<TData = unknown>(event: string, data?: TData): number {
			console.debug("[Verani:Emit] Channel emit:", event, "to channel:", channel);
			const eventData = { type: event, ...(data as object) };
			return broadcastImpl(sessions, channel, eventData, opts);
		}
	};
}

/**
 * Creates a socket-level emit API for a specific connection context
 * Allows emitting to current socket, user, or channel
 *
 * @deprecated Use createConnectionEmit() for the new per-connection architecture
 */
export function createSocketEmit<TMeta extends ConnectionMeta, E>(
	ctx: MessageContext<TMeta, E>
): SocketEmit<TMeta, E> {
	const defaultChannel = ctx.meta.channels[0] || "default";

	return {
		/**
		 * Emit to the current socket
		 */
		emit<TData = unknown>(event: string, data?: TData): void {
			console.debug(`[Verani:Emit] Socket emit: ${event}`);
			if (ctx.ws.readyState !== WebSocket.OPEN) {
				console.warn(`[Verani:Emit] Cannot emit to closed socket: ${event}`);
				return;
			}

			try {
				const eventData = { type: event, ...(data as object) };
				const frame = { type: "event", channel: defaultChannel, data: eventData };
				ctx.ws.send(encodeFrame(frame));
			} catch (error) {
				console.error(`[Verani:Emit] Failed to emit to socket:`, error);
			}
		},

		/**
		 * Target a specific user or channel for emitting
		 * If target matches one of the current user's channels, it's treated as a channel.
		 * Otherwise, it's treated as a userId.
		 */
		to(target: string): EmitBuilder<TMeta, E> {
			console.debug("[Verani:Emit] Socket.to() called with target:", target);
			// Check if target is a channel the current user is subscribed to
			const isChannel = ctx.meta.channels.includes(target);
			console.debug("[Verani:Emit] Target is channel:", isChannel, "user channels:", ctx.meta.channels);

			if (isChannel) {
				// Target is a channel - broadcast to it, excluding current socket
				return createChannelEmitBuilder(
					target,
					ctx.actor.sessions,
					{ except: ctx.ws }
				);
			} else {
				// Target is assumed to be a userId
				return createUserEmitBuilder(
					target,
					ctx.actor.sessions,
					defaultChannel
				);
			}
		}
	};
}

/**
 * Creates an actor-level emit API for broadcasting
 * Allows broadcasting to channels
 *
 * @deprecated Use createConnectionEmit() for the new per-connection architecture
 */
export function createActorEmit<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>
): ActorEmit<TMeta, E> {
	const defaultChannel = "default";

	return {
		/**
		 * Broadcast to default channel
		 */
		emit<TData = unknown>(event: string, data?: TData): number {
			console.debug(`[Verani:Emit] Actor emit: ${event}`);
			const eventData = { type: event, ...(data as object) };
			return broadcastImpl(actor.sessions, defaultChannel, eventData);
		},

		/**
		 * Target a specific channel for broadcasting
		 */
		to(channel: string): EmitBuilder<TMeta, E> {
			console.debug("[Verani:Emit] Actor.to() called with channel:", channel);
			return createChannelEmitBuilder(channel, actor.sessions);
		}
	};
}

