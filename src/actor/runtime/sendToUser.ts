import { encodeFrame } from "../protocol";
import type { MessageFrame, ConnectionMeta } from "../types";

/**
 * Sends a message to a specific user (all their sessions)
 * @param sessions - Map of WebSocket sessions
 * @param userId - The user ID to send to
 * @param channel - The channel to send to
 * @param data - Message data
 * @returns Number of sessions that received the message
 */
export function sendToUser<TMeta extends ConnectionMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>,
	userId: string,
	channel: string,
	data?: any
): number {
	console.debug("[Verani:ActorRuntime] Sending to user:", userId, "on channel:", channel);
	let sentCount = 0;
	const frame: MessageFrame = { type: "event", channel, data };
	const encoded = encodeFrame(frame);
	const failedSessions: WebSocket[] = [];

	// Send only to sessions of that user which are subscribed to the channel
	for (const { ws, meta } of sessions.values()) {
		if (meta.userId === userId && meta.channels.includes(channel)) {
			// Check WebSocket state before sending
			if (ws.readyState !== WebSocket.OPEN) {
				console.debug("[Verani:ActorRuntime] Skipping closed/closing WebSocket for user:", userId);
				failedSessions.push(ws);
				continue;
			}

			try {
				ws.send(encoded);
				sentCount++;
			} catch (error) {
				console.error("[Verani] Failed to send to user:", error);
				failedSessions.push(ws);
			}
		}
	}

	// Clean up failed sessions
	for (const ws of failedSessions) {
		sessions.delete(ws);
	}
	if (failedSessions.length > 0) {
		console.debug("[Verani:ActorRuntime] Removed", failedSessions.length, "failed sessions during sendToUser");
	}

	console.debug("[Verani:ActorRuntime] SendToUser complete, sent to:", sentCount, "sessions");
	return sentCount;
}

