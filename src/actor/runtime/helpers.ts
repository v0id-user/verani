import type { ConnectionMeta } from "../types";

/**
 * Gets the total number of active sessions
 * @param sessions - Map of WebSocket sessions
 * @returns Number of connected WebSockets
 */
export function getSessionCount<TMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>
): number {
	const count = sessions.size;
	console.debug("[Verani:ActorRuntime] getSessionCount:", count);
	return count;
}

/**
 * Gets all unique user IDs currently connected
 * @param sessions - Map of WebSocket sessions
 * @returns Array of unique user IDs
 */
export function getConnectedUserIds<TMeta extends ConnectionMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>
): string[] {
	const userIds = new Set<string>();
	for (const { meta } of sessions.values()) {
		userIds.add(meta.userId);
	}
	const result = Array.from(userIds);
	console.debug("[Verani:ActorRuntime] getConnectedUserIds:", result);
	return result;
}

/**
 * Gets all sessions for a specific user
 * @param sessions - Map of WebSocket sessions
 * @param userId - The user ID to filter by
 * @returns Array of WebSockets belonging to the user
 */
export function getUserSessions<TMeta extends ConnectionMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>,
	userId: string
): WebSocket[] {
	console.debug("[Verani:ActorRuntime] getUserSessions for userId:", userId);
	const sockets: WebSocket[] = [];
	for (const { ws, meta } of sessions.values()) {
		if (meta.userId === userId) {
			sockets.push(ws);
		}
	}
	console.debug("[Verani:ActorRuntime] getUserSessions found", sockets.length, "sessions");
	return sockets;
}

/**
 * Gets the Durable Object storage interface
 * @param ctx - Actor context
 * @returns DurableObjectStorage instance
 */
export function getStorage(ctx: { storage: DurableObjectStorage }): DurableObjectStorage {
	console.debug("[Verani:ActorRuntime] getStorage called");
	return ctx.storage;
}

