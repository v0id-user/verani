import { restoreSessions } from "../attachment";
import type { RoomDefinition, ConnectionMeta, VeraniActor } from "../types";

/**
 * Called when the Actor initializes or wakes from hibernation
 * Restores sessions from WebSocket attachments
 */
export async function onInit<TMeta extends ConnectionMeta, E>(
	actor: VeraniActor<TMeta, E>,
	room: RoomDefinition<TMeta, E>
): Promise<void> {
	console.debug("[Verani:ActorRuntime] onInit called");

	// Restore sessions with separate error handling
	let restoreError: Error | undefined;
	try {
		restoreSessions(actor);
		console.debug("[Verani:ActorRuntime] Sessions restored, count:", actor.sessions.size);
	} catch (error) {
		restoreError = error as Error;
		console.error("[Verani] Failed to restore sessions:", error);
	}

	// Always attempt to call onHibernationRestore if defined, even if restoration partially failed
	// This allows user code to handle partial restoration scenarios
	if (room.onHibernationRestore && actor.sessions.size > 0) {
		try {
			console.debug("[Verani:ActorRuntime] Calling onHibernationRestore hook");
			await room.onHibernationRestore(actor);
			console.debug("[Verani:ActorRuntime] onHibernationRestore hook completed");
		} catch (error) {
			console.error("[Verani] Error in onHibernationRestore hook:", error);
		}
	} else if (room.onHibernationRestore && actor.sessions.size === 0 && !restoreError) {
		console.debug("[Verani:ActorRuntime] Skipping onHibernationRestore - no sessions to restore");
	}
}

