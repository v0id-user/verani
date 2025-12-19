/**
 * Presence Room Coordinator (RoomDO)
 *
 * This RoomDO manages the presence room membership and coordinates
 * message delivery between ConnectionDOs.
 *
 * Key responsibilities:
 * - Track which users are in the room
 * - Broadcast messages to all room members via RPC
 * - Store shared room state (e.g., presence list)
 *
 * Note: This DO does NOT hold any WebSocket connections.
 * All WebSocket connections are owned by ConnectionDOs.
 */

import { createRoomHandler } from "../src/verani";

/**
 * Presence Room Coordinator
 *
 * Handles membership management and presence broadcasts.
 * When a user joins/leaves, this DO notifies all other members via RPC.
 */
export const PresenceRoomCoordinator = createRoomHandler({
	name: "PresenceRoomCoordinator",

	/**
	 * Called when the RoomDO initializes or wakes from hibernation
	 */
	async onInit(roomState) {
		console.log("[PresenceRoomCoordinator] Initializing");

		// Initialize room state if needed
		if (!roomState.totalJoins) {
			roomState.totalJoins = 0;
		}
		if (!roomState.createdAt) {
			roomState.createdAt = Date.now();
		}
	},

	/**
	 * Called when a user joins the presence room
	 * This is triggered by ConnectionDO.joinRoom("presence", metadata)
	 */
	async onJoin(roomState, userId, metadata) {
		console.log(`[PresenceRoomCoordinator] User ${userId} joined with metadata:`, metadata);

		// Update room state
		roomState.totalJoins = (roomState.totalJoins as number || 0) + 1;
		roomState.lastJoinAt = Date.now();

		// Note: The broadcast to notify other users about the join
		// is typically done by the ConnectionDO after joining,
		// since it has access to the room stub for broadcasting.
	},

	/**
	 * Called when a user leaves the presence room
	 * This is triggered by ConnectionDO.leaveRoom() or disconnect
	 */
	async onLeave(roomState, userId) {
		console.log(`[PresenceRoomCoordinator] User ${userId} left`);

		roomState.lastLeaveAt = Date.now();

		// Note: The broadcast to notify other users about the leave
		// is typically done by the ConnectionDO before/after leaving.
	}
});

// Export for use in wrangler.toml bindings
export { PresenceRoomCoordinator as PresenceRoom };
