/**
 * Removes all WebSocket sessions that are not in OPEN state
 * This prevents stale connections from accumulating in memory
 * @param sessions - Map of WebSocket sessions
 * @returns Number of sessions cleaned up
 */
export function cleanupStaleSessions<TMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>
): number {
	let cleanedCount = 0;
	const deadSessions: WebSocket[] = [];

	// Collect dead sessions
	for (const [ws, session] of sessions.entries()) {
		if (ws.readyState !== WebSocket.OPEN) {
			deadSessions.push(ws);
		}
	}

	// Remove dead sessions
	for (const ws of deadSessions) {
		sessions.delete(ws);
		cleanedCount++;
	}

	if (cleanedCount > 0) {
		console.debug("[Verani:ActorRuntime] Cleaned up", cleanedCount, "dead sessions");
	}

	return cleanedCount;
}

