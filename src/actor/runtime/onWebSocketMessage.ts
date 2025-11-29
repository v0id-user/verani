import { decodeFrame, encodeFrame } from "../protocol";
import type { RoomDefinition, MessageContext, MessageFrame, ConnectionMeta, VeraniActor } from "../types";

/**
 * Called when a message is received from a WebSocket
 */
export async function onWebSocketMessage<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	room: RoomDefinition<TMeta, E>,
	ws: WebSocket,
	raw: any
): Promise<void> {
	let session: { ws: WebSocket; meta: TMeta } | undefined;

	try {
		// Decode the incoming frame
		const frame = decodeFrame(raw);

		// Handle protocol-encoded ping messages
		if (frame && frame.type === "ping") {
			console.debug("[Verani:ActorRuntime] Received protocol-encoded ping, responding with pong");
			// Respond immediately with protocol-encoded pong
			if (ws.readyState === WebSocket.OPEN) {
				try {
					const pongFrame: MessageFrame = { type: "pong" };
					ws.send(encodeFrame(pongFrame));
					console.debug("[Verani:ActorRuntime] Sent protocol-encoded pong");
				} catch (error) {
					console.error("[Verani] Failed to send pong:", error);
				}
			}
			return;
		}

		if (!frame || frame.type === "invalid") {
			console.debug("[Verani:ActorRuntime] Invalid or unparseable frame, skipping");
			return;
		}

		console.debug("[Verani:ActorRuntime] Message received, type:", frame.type, "channel:", frame.channel);

		// Get session info
		session = actor.sessions.get(ws);
		if (!session) {
			console.warn("[Verani] Received message from unknown session");
			return;
		}
		console.debug("[Verani:ActorRuntime] Session found:", { userId: session.meta.userId, clientId: session.meta.clientId });

		// Call user-defined onMessage hook
		if (room.onMessage) {
			console.debug("[Verani:ActorRuntime] Calling user onMessage hook");
			const ctx: MessageContext<TMeta, E> = {
				actor,
				ws,
				meta: session.meta,
				frame
			};
			await room.onMessage(ctx, frame);
			console.debug("[Verani:ActorRuntime] User onMessage hook completed");
		}
	} catch (error) {
		console.error("[Verani] Error in onWebSocketMessage:", error);

		// Call error handler if defined
		if (room.onError && session) {
			try {
				await room.onError(error as Error, {
					actor,
					ws,
					meta: session.meta
				});
			} catch (errorHandlerError) {
				console.error("[Verani] Error in onError handler:", errorHandlerError);
			}
		}
	}
}

