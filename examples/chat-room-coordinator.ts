/**
 * Chat Room Coordinator (RoomDO)
 *
 * This RoomDO manages the chat room membership and coordinates
 * message delivery between ConnectionDOs.
 *
 * Key responsibilities:
 * - Track which users are in the room
 * - Broadcast messages to all room members via RPC
 * - Store shared room state (e.g., message history, user list)
 *
 * Note: This DO does NOT hold any WebSocket connections.
 * All WebSocket connections are owned by ConnectionDOs.
 */

import { createRoomHandler } from "../src/verani";

/**
 * Chat Room Coordinator
 *
 * Handles membership management and chat broadcasts.
 * When a user joins/leaves, this DO manages the room state.
 */
export const ChatRoomCoordinator = createRoomHandler({
	name: "ChatRoomCoordinator",

	/**
	 * Called when the RoomDO initializes or wakes from hibernation
	 */
	async onInit(roomState) {
		console.log("[ChatRoomCoordinator] Initializing");

		// Initialize room state if needed
		if (!roomState.messageCount) {
			roomState.messageCount = 0;
		}
		if (!roomState.createdAt) {
			roomState.createdAt = Date.now();
		}
	},

	/**
	 * Called when a user joins the chat room
	 * This is triggered by ConnectionDO.joinRoom("chat", metadata)
	 */
	async onJoin(roomState, userId, metadata) {
		console.log(`[ChatRoomCoordinator] User ${userId} joined with metadata:`, metadata);

		roomState.lastJoinAt = Date.now();

		// Note: The broadcast to notify other users about the join
		// is typically done by the ConnectionDO after joining,
		// since it has access to the room stub for broadcasting.
	},

	/**
	 * Called when a user leaves the chat room
	 * This is triggered by ConnectionDO.leaveRoom() or disconnect
	 */
	async onLeave(roomState, userId) {
		console.log(`[ChatRoomCoordinator] User ${userId} left`);

		roomState.lastLeaveAt = Date.now();

		// Note: The broadcast to notify other users about the leave
		// is typically done by the ConnectionDO before/after leaving.
	}
});

// Export for use in wrangler.toml bindings
export { ChatRoomCoordinator as ChatRoom };
