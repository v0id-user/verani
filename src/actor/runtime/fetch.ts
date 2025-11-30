import type { RoomDefinition, ConnectionMeta } from "../types";

/**
 * Type representing an actor instance with the methods needed for fetch handling.
 * Uses method signatures without visibility constraints to allow accessing protected methods.
 */
export interface ActorInstanceWithFetchMethods {
	shouldUpgradeWebSocket(request: Request): Promise<boolean>;
	onWebSocketUpgrade(request: Request): Promise<Response>;
	onRequest(request: Request): Promise<Response>;
}

/**
 * Creates the fetch method for the actor class
 * Handles WebSocket upgrade requests
 */
export function createFetch<TMeta extends ConnectionMeta, E>(
	room: RoomDefinition<TMeta, E>,
	actorInstance: ActorInstanceWithFetchMethods
): (request: Request) => Promise<Response> {
	return async function fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const upgradeHeader = request.headers.get("Upgrade");

		if (url.pathname === room.websocketPath && upgradeHeader === 'websocket') {
			const shouldUpgrade = await actorInstance.shouldUpgradeWebSocket(request);
			if (shouldUpgrade) {
				return actorInstance.onWebSocketUpgrade(request);
			}
		}

		return actorInstance.onRequest(request);
	};
}

