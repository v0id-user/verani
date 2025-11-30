import type { VeraniActor, ConnectionMeta, RpcEmitBuilder } from "../types";
import { broadcast as broadcastImpl } from "./broadcast";
import { sendToUser as sendToUserImpl } from "./sendToUser";

/**
 * Creates an RPC-safe emit builder that targets a specific channel.
 * The builder object can be serialized over RPC and its emit method
 * will make RPC calls back to the actor.
 */
export function createRpcChannelEmitBuilder<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	channel: string
): RpcEmitBuilder {
	return {
		async emit(event: string, data?: any): Promise<number> {
			// Call the emitToChannel RPC method
			return (actor as any).emitToChannel(channel, event, data);
		}
	};
}

/**
 * Creates an RPC-safe emit builder that targets a specific user.
 * The builder object can be serialized over RPC and its emit method
 * will make RPC calls back to the actor.
 */
export function createRpcUserEmitBuilder<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	userId: string,
	defaultChannel: string = "default"
): RpcEmitBuilder {
	return {
		async emit(event: string, data?: any): Promise<number> {
			// Call the emitToUser RPC method
			return (actor as any).emitToUser(userId, event, data);
		}
	};
}

/**
 * Creates an RPC-safe emit builder with smart routing.
 * Determines if target is a channel or userId based on connected sessions.
 */
export function createRpcEmitBuilder<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	target: string,
	defaultChannel: string = "default"
): RpcEmitBuilder {
	// Check if target matches any user's channel subscription
	let isChannel = false;
	for (const { meta } of actor.sessions.values()) {
		if (meta.channels.includes(target)) {
			isChannel = true;
			break;
		}
	}

	if (isChannel) {
		return createRpcChannelEmitBuilder(actor, target);
	} else {
		// Assume it's a userId
		return createRpcUserEmitBuilder(actor, target, defaultChannel);
	}
}

