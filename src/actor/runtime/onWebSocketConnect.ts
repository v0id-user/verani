/**
 * @fileoverview Legacy WebSocket connect handler for the global router architecture.
 *
 * This module is part of the LEGACY createActorHandler() system where all connections
 * are handled by a single Durable Object. It intentionally uses deprecated functions
 * like createSocketEmit() because this entire module is part of the deprecated architecture.
 *
 * For new projects, use the per-connection architecture:
 * - createConnectionHandler() from "../connection-actor"
 * - createRoomHandler() from "../room-actor"
 *
 * The deprecation warnings on createSocketEmit() are expected and correct here.
 */
import { storeAttachment } from "../attachment";
import type { RoomDefinition, RoomContext, MessageContext, ConnectionMeta, VeraniActor, MessageFrame } from "../types";
// Note: createSocketEmit is deprecated for NEW code, but this legacy module should continue using it
import { createSocketEmit } from "./emit";

/**
 * Called when a new WebSocket connection is established.
 * Extracts metadata from the request, stores it as an attachment for hibernation survival,
 * calls the user-defined onConnect hook, and adds the session to the sessions map.
 * If onConnect throws, the connection is closed and no session is created.
 *
 * @param actor - The actor instance handling the connection
 * @param room - The room definition with extractMeta and onConnect hooks
 * @param ws - The WebSocket connection being established
 * @param req - The HTTP request that initiated the WebSocket upgrade
 * @returns Promise that resolves when connection handling is complete
 * @throws Error if critical connection setup fails (connection is closed on error)
 */
export async function onWebSocketConnect<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	room: RoomDefinition<TMeta, E>,
	ws: WebSocket,
	req: Request
): Promise<void> {
	console.debug("[Verani:ActorRuntime] onWebSocketConnect called, url:", req.url);
	let meta: TMeta | undefined;

	try {
		// Extract metadata from request
		if (room.extractMeta) {
			meta = await room.extractMeta(req) as TMeta;
			console.debug("[Verani:ActorRuntime] Extracted metadata:", { userId: meta.userId, clientId: meta.clientId, channels: meta.channels });
		} else {
			meta = {
				userId: "anonymous",
				clientId: crypto.randomUUID(),
				channels: ["default"]
			} as unknown as TMeta;
			console.debug("[Verani:ActorRuntime] Using default metadata:", meta);
		}

		// Store attachment for hibernation survival
		storeAttachment(ws, meta);

		// Call user-defined onConnect hook BEFORE adding to sessions map
		// This prevents orphaned sessions if onConnect throws
		if (room.onConnect) {
			console.debug("[Verani:ActorRuntime] Calling user onConnect hook");
			// Create a temporary message context for emit API creation
			// We need to create emit first, then reference it in the context
			const tempMessageCtx = {
				actor,
				ws,
				meta,
				frame: { type: "connect" } as MessageFrame
			} as MessageContext<TMeta, E>;
			// Add emit to the context (createSocketEmit only reads actor.sessions, ws, and meta)
			tempMessageCtx.emit = createSocketEmit(tempMessageCtx);

			const ctx: RoomContext<TMeta, E> = {
				actor,
				ws,
				meta,
				emit: tempMessageCtx.emit
			};
			await room.onConnect(ctx);
			console.debug("[Verani:ActorRuntime] User onConnect hook completed");
		}

		// Add to in-memory sessions ONLY after successful onConnect
		actor.sessions.set(ws, { ws, meta });
		console.debug("[Verani:ActorRuntime] Session added, total sessions:", actor.sessions.size);
	} catch (error) {
		console.error("[Verani] Error in onWebSocketConnect:", error);

		// Call error handler if defined
		if (room.onError && meta) {
			try {
				const tempMessageCtx = {
					actor,
					ws,
					meta,
					frame: { type: "error" } as MessageFrame
				} as MessageContext<TMeta, E>;
				tempMessageCtx.emit = createSocketEmit(tempMessageCtx);

				await room.onError(error as Error, {
					actor,
					ws,
					meta,
					emit: tempMessageCtx.emit
				});
			} catch (errorHandlerError) {
				console.error("[Verani] Error in onError handler:", errorHandlerError);
			}
		}

		// Close connection on critical errors
		ws.close(1011, "Internal server error");
	}
}

