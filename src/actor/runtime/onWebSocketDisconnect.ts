import type { RoomDefinition, RoomContext, MessageContext, ConnectionMeta, VeraniActor, MessageFrame } from "../types";
import { createSocketEmit } from "./emit";

/**
 * Called when a WebSocket connection is closed.
 * Removes the session from the sessions map and calls the user-defined onDisconnect hook.
 * The session is removed before calling onDisconnect to ensure cleanup happens even if the hook throws.
 *
 * @param actor - The actor instance handling the disconnection
 * @param room - The room definition with onDisconnect hook
 * @param ws - The WebSocket connection that was closed
 * @returns Promise that resolves when disconnection handling is complete
 * @throws Error if disconnection handling fails (errors are logged but not propagated)
 */
export async function onWebSocketDisconnect<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	room: RoomDefinition<TMeta, E>,
	ws: WebSocket
): Promise<void> {
	console.debug("[Verani:ActorRuntime] onWebSocketDisconnect called");
	try {
		const session = actor.sessions.get(ws);
		if (session) {
			console.debug("[Verani:ActorRuntime] Disconnecting session:", { userId: session.meta.userId, clientId: session.meta.clientId });
		}

		// Remove from sessions map
		actor.sessions.delete(ws);
		console.debug("[Verani:ActorRuntime] Session removed, remaining sessions:", actor.sessions.size);

		// Call user-defined onDisconnect hook
		if (session && room.onDisconnect) {
			console.debug("[Verani:ActorRuntime] Calling user onDisconnect hook");
			const tempMessageCtx: MessageContext<TMeta, E> = {
				actor,
				ws,
				meta: session.meta,
				frame: { type: "disconnect" }
			};
			const ctx: RoomContext<TMeta, E> = {
				actor,
				ws,
				meta: session.meta,
				emit: createSocketEmit(tempMessageCtx)
			};
			await room.onDisconnect(ctx);
			console.debug("[Verani:ActorRuntime] User onDisconnect hook completed");
		}
	} catch (error) {
		console.error("[Verani] Error in onWebSocketDisconnect:", error);

		// Error handler is not called here since we may not have session context
	}
}

