import type { RoomDefinition, ConnectionMeta } from "../types";

/**
 * Type representing an actor instance with the methods needed for fetch handling.
 * Uses method signatures without visibility constraints to allow accessing protected methods.
 * This interface is used internally to type-check actor instances passed to createFetch.
 */
export interface ActorInstanceWithFetchMethods {
	shouldUpgradeWebSocket(request: Request): Promise<boolean>;
	onWebSocketUpgrade(request: Request): Promise<Response>;
	onRequest(request: Request): Promise<Response>;
}

/**
 * Creates the fetch method for the actor class.
 * Handles WebSocket upgrade requests by checking the path and Upgrade header,
 * then delegating to shouldUpgradeWebSocket and onWebSocketUpgrade if appropriate.
 * Non-WebSocket requests are passed to onRequest.
 *
 * @param room - The room definition containing the websocketPath
 * @param actorInstance - The actor instance with WebSocket upgrade methods
 * @returns A fetch function that handles HTTP requests and WebSocket upgrades
 */
export function createFetch<TMeta extends ConnectionMeta, E>(
	room: RoomDefinition<TMeta, E>,
	actorInstance: ActorInstanceWithFetchMethods
): (request: Request) => Promise<Response> {
	return async function fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const upgradeHeader = request.headers.get("Upgrade");

		console.debug(
			`[Verani:Fetch] fetch() called. Path: ${url.pathname}, Upgrade header: ${upgradeHeader}, Expected ws path: ${room.websocketPath}`
		);

		if (url.pathname === room.websocketPath && upgradeHeader === 'websocket') {
			console.debug(
				`[Verani:Fetch] WebSocket upgrade requested on path ${url.pathname}. Checking shouldUpgradeWebSocket...`
			);
			const shouldUpgrade = await actorInstance.shouldUpgradeWebSocket(request);
			if (shouldUpgrade) {
				console.debug(
					`[Verani:Fetch] shouldUpgradeWebSocket returned true. Handling WebSocket upgrade.`
				);
				return actorInstance.onWebSocketUpgrade(request);
			} else {
				console.debug(
					`[Verani:Fetch] shouldUpgradeWebSocket returned false. Passing to onRequest instead.`
				);
			}
		} else {
			console.debug(
				`[Verani:Fetch] Not a WebSocket upgrade request or path does not match. Passing to onRequest.`
			);
		}

		return actorInstance.onRequest(request);
	};
}

