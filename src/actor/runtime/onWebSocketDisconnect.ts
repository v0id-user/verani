import type { RoomDefinition, RoomContext, ConnectionMeta, VeraniActor } from "../types";

/**
 * Called when a WebSocket connection is closed
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
			const ctx: RoomContext<TMeta, E> = {
				actor,
				ws,
				meta: session.meta
			};
			await room.onDisconnect(ctx);
			console.debug("[Verani:ActorRuntime] User onDisconnect hook completed");
		}
	} catch (error) {
		console.error("[Verani] Error in onWebSocketDisconnect:", error);

		// Error handler is not called here since we may not have session context
	}
}

