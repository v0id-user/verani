import { decodeFrame, encodeFrame } from "../protocol";
import type { RoomDefinition, MessageContext, MessageFrame, ConnectionMeta, VeraniActor, WebSocketRawData } from "../types";
import { createSocketEmit } from "./emit";

/**
 * Called when a message is received from a WebSocket.
 * Decodes the message frame, handles protocol-level ping/pong messages,
 * and routes the message to either event handlers (if registered) or the onMessage hook.
 *
 * @param actor - The actor instance handling the message
 * @param room - The room definition with event handlers and onMessage hook
 * @param ws - The WebSocket connection that received the message
 * @param raw - Raw message data from the WebSocket
 * @returns Promise that resolves when message handling is complete
 * @throws Error if message processing fails (error handler is called if defined)
 */
export async function onWebSocketMessage<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	room: RoomDefinition<TMeta, E>,
	ws: WebSocket,
	raw: WebSocketRawData
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

		// Create context with emit API
		const ctx: MessageContext<TMeta, E> = {
			actor,
			ws,
			meta: session.meta,
			frame,
			emit: createSocketEmit({
				actor,
				ws,
				meta: session.meta,
				frame
			} as MessageContext<TMeta, E>)
		};

		// Check if event handlers are registered for this event type
		const eventEmitter = room.eventEmitter;
		const hasEventHandlers = eventEmitter?.hasHandlers(frame.type);

		if (hasEventHandlers) {
			// Use event handlers (socket.io-like)
			console.debug("[Verani:ActorRuntime] Using event handlers for event:", frame.type);
			await eventEmitter!.emit(frame.type, ctx, frame.data || {});
			console.debug("[Verani:ActorRuntime] Event handlers completed");
		} else if (room.onMessage) {
			// Fall back to onMessage hook
			console.debug("[Verani:ActorRuntime] Calling user onMessage hook");
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
					meta: session.meta,
					emit: createSocketEmit({
						actor,
						ws,
						meta: session.meta,
						frame: { type: "error" }
					} as MessageContext<TMeta, E>)
				});
			} catch (errorHandlerError) {
				console.error("[Verani] Error in onError handler:", errorHandlerError);
			}
		}
	}
}

