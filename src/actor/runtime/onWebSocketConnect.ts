import { storeAttachment } from "../attachment";
import type { RoomDefinition, RoomContext, MessageContext, ConnectionMeta, VeraniActor, MessageFrame } from "../types";
import { createSocketEmit } from "./emit";

/**
 * Called when a new WebSocket connection is established
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

		// Create a temporary message context for emit API creation
		const tempMessageCtx: MessageContext<TMeta, E> = {
			actor,
			ws,
			meta,
			frame: { type: "connect" }
		};

		// Call user-defined onConnect hook BEFORE adding to sessions map
		// This prevents orphaned sessions if onConnect throws
		if (room.onConnect) {
			console.debug("[Verani:ActorRuntime] Calling user onConnect hook");
			const ctx: RoomContext<TMeta, E> = {
				actor,
				ws,
				meta,
				emit: createSocketEmit(tempMessageCtx)
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
				const tempMessageCtx: MessageContext<TMeta, E> = {
					actor,
					ws,
					meta,
					frame: { type: "error" }
				};
				await room.onError(error as Error, {
					actor,
					ws,
					meta,
					emit: createSocketEmit(tempMessageCtx)
				});
			} catch (errorHandlerError) {
				console.error("[Verani] Error in onError handler:", errorHandlerError);
			}
		}

		// Close connection on critical errors
		ws.close(1011, "Internal server error");
	}
}

