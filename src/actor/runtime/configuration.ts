import type { ActorConfiguration } from "@cloudflare/actors";
import type { RoomDefinition, ConnectionMeta } from "../types";

/**
 * Static configuration method for Cloudflare Actors
 * Specifies WebSocket upgrade path and other options
 */
export function createConfiguration<TMeta extends ConnectionMeta, E>(
	room: RoomDefinition<TMeta, E>
): (request?: Request) => ActorConfiguration {
	return function configuration(request?: Request): ActorConfiguration {
		const config: ActorConfiguration = {
			locationHint: "me",
			sockets: {
				upgradePath: room.websocketPath
				// autoResponse removed - we handle ping/pong manually via protocol-encoded messages
			}
		};

		console.debug("[Verani:ActorRuntime] configuration() called, request:", request ? request.url : "undefined");
		console.debug("[Verani:ActorRuntime] configuration() resolved config:", config);

		return config;
	};
}

