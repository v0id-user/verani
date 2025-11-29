import { encodeFrame } from "../protocol";
import type { MessageFrame, BroadcastOptions, ConnectionMeta } from "../types";

/**
 * Broadcasts a message to all connections in a channel
 * @param sessions - Map of WebSocket sessions
 * @param channel - The channel to broadcast to
 * @param data - The data to send
 * @param opts - Broadcast options (filtering, exclusions)
 * @returns Number of connections that received the message
 */
export function broadcast<TMeta extends ConnectionMeta>(
	sessions: Map<WebSocket, { ws: WebSocket; meta: TMeta }>,
	channel: string,
	data: any,
	opts?: BroadcastOptions
): number {
	console.debug("[Verani:ActorRuntime] Broadcasting to channel:", channel, "options:", opts);
	let sentCount = 0;
	const frame: MessageFrame = { type: "event", channel, data };
	const encoded = encodeFrame(frame);
	const failedSessions: WebSocket[] = [];

	for (const { ws, meta } of sessions.values()) {
		// Skip if channel filter doesn't match
		if (!meta.channels.includes(channel)) {
			continue;
		}

		// Skip if this is the excluded WebSocket
		if (opts?.except && ws === opts.except) {
			continue;
		}

		// Skip if userIds filter is specified and doesn't match
		if (opts?.userIds && !opts.userIds.includes(meta.userId)) {
			continue;
		}

		// Skip if clientIds filter is specified and doesn't match
		if (opts?.clientIds && !opts.clientIds.includes(meta.clientId)) {
			continue;
		}

		// Check WebSocket state before sending
		if (ws.readyState !== WebSocket.OPEN) {
			console.debug("[Verani:ActorRuntime] Skipping closed/closing WebSocket");
			failedSessions.push(ws);
			continue;
		}

		try {
			ws.send(encoded);
			sentCount++;
		} catch (error) {
			console.error("[Verani] Failed to send to WebSocket:", error);
			failedSessions.push(ws);
		}
	}

	// Clean up failed sessions
	for (const ws of failedSessions) {
		sessions.delete(ws);
	}
	if (failedSessions.length > 0) {
		console.debug("[Verani:ActorRuntime] Removed", failedSessions.length, "failed sessions during broadcast");
	}

	console.debug("[Verani:ActorRuntime] Broadcast complete, sent to:", sentCount, "sessions");
	return sentCount;
}

