import type { ActorConfiguration } from "@cloudflare/actors";
import type { RoomDefinition, ConnectionMeta } from "../types";

/**
 * Creates the static configuration method for Cloudflare Actors.
 * Specifies the WebSocket upgrade path and other actor configuration options.
 * This function returns a configuration function that is used by Cloudflare's Actor runtime.
 *
 * @param room - The room definition containing the websocketPath
 * @returns A configuration function that returns ActorConfiguration
 * @example
 * ```typescript
 * static configuration = createConfiguration(room);
 * // Returns: { sockets: { upgradePath: "/ws" } }
 * ```
 */
export function createConfiguration<TMeta extends ConnectionMeta, E>(
	room: RoomDefinition<TMeta, E>
): (request?: Request) => ActorConfiguration {
	return function configuration(request?: Request): ActorConfiguration {
		const config: ActorConfiguration = {
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

