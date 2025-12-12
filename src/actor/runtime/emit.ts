import { encodeFrame } from "../protocol";
import type {
	SocketEmit,
	ActorEmit,
	EmitBuilder,
	MessageContext,
	VeraniActor,
	ConnectionMeta,
	BroadcastOptions
} from "../types";
import { broadcast as broadcastImpl } from "./broadcast";
import { sendToUser as sendToUserImpl } from "./sendToUser";

/**
 * Creates an emit builder that targets a specific user.
 * Messages sent through this builder will be delivered to all sessions belonging to the user
 * that are subscribed to the specified channel.
 *
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
		emit(event: string, data?: any): number {
			console.debug("[Verani:Emit] User emit:", event, "to userId:", userId);
			const eventData = { type: event, ...data };
			return sendToUserImpl(sessions, userId, defaultChannel, eventData);
		}
	};
}

/**
 * Creates an emit builder that targets a specific channel.
 * Messages sent through this builder will be broadcast to all connections subscribed to the channel,
 * with optional filtering by userIds, clientIds, or exclusion of specific WebSockets.
 *
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
		emit(event: string, data?: any): number {
			console.debug("[Verani:Emit] Channel emit:", event, "to channel:", channel);
			const eventData = { type: event, ...data };
			return broadcastImpl(sessions, channel, eventData, opts);
		}
	};
}

/**
 * Creates a socket-level emit API for a specific connection context
 * Allows emitting to current socket, user, or channel
 */
export function createSocketEmit<TMeta extends ConnectionMeta, E>(
	ctx: MessageContext<TMeta, E>
): SocketEmit<TMeta, E> {
	const defaultChannel = ctx.meta.channels[0] || "default";

	return {
		/**
		 * Emit to the current socket
		 */
		emit(event: string, data?: any): void {
			console.debug(`[Verani:Emit] Socket emit: ${event}`);
			if (ctx.ws.readyState !== WebSocket.OPEN) {
				console.warn(`[Verani:Emit] Cannot emit to closed socket: ${event}`);
				return;
			}

			try {
				const eventData = { type: event, ...data };
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
 */
export function createActorEmit<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>
): ActorEmit<TMeta, E> {
	const defaultChannel = "default";

	return {
		/**
		 * Broadcast to default channel
		 */
		emit(event: string, data?: any): number {
			console.debug(`[Verani:Emit] Actor emit: ${event}`);
			const eventData = { type: event, ...data };
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

