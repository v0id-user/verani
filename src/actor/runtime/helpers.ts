import type { ConnectionMeta } from "../types";

/**
 * Gets the total number of active sessions
 * @param sessions - Map of WebSocket sessions
 * @returns Number of connected WebSockets
 */
export function getSessionCount<TMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>
): number {
	return sessions.size;
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
	return Array.from(userIds);
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
	const sockets: WebSocket[] = [];
	for (const { ws, meta } of sessions.values()) {
		if (meta.userId === userId) {
			sockets.push(ws);
		}
	}
	return sockets;
}

/**
 * Gets the Durable Object storage interface
 * @param ctx - Actor context
 * @returns DurableObjectStorage instance
 */
export function getStorage(ctx: { storage: DurableObjectStorage }): DurableObjectStorage {
	return ctx.storage;
}

