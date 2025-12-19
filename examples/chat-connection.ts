/**
 * Chat Connection Example (Per-Connection Architecture)
 *
 * This example demonstrates a chat application using the per-connection pattern:
 * - Each user gets their own ConnectionDO (identified by userId)
 * - Chat room coordination is handled by ChatRoomCoordinator (RoomDO)
 * - Message broadcasting uses DO-to-DO RPC
 *
 * Features:
 * - Real-time message broadcasting
 * - Typing indicators
 * - Online user tracking
 * - Join/leave notifications
 */

import { defineConnection, createConnectionHandler } from "../src/verani";
import type { ConnectionMeta } from "../src/verani";

/**
 * Extended metadata for chat connections
 */
interface ChatMeta extends ConnectionMeta {
	username: string;
	joinedAt: number;
}

/**
 * Validate token and extract user info
 */
function validateToken(token: string): { userId: string; username: string } | null {
	const parts = token.split(":");
	if (parts.length === 2 && parts[0] === "user") {
		return {
			userId: parts[1],
			username: parts[1]
		};
	}
	return null;
}

/**
 * Define the connection handler for chat
 */
const chatConnection = defineConnection<ChatMeta>({
	name: "ChatConnection",
	websocketPath: "/ws",

	/**
	 * Extract metadata from the WebSocket upgrade request
	 */
	extractMeta(req): ChatMeta {
		const url = new URL(req.url);
		const token = url.searchParams.get("token");

		if (!token) {
			throw new Error("Authentication required");
		}

		const user = validateToken(token);
		if (!user) {
			throw new Error("Invalid token");
		}

		return {
			userId: user.userId,
			clientId: crypto.randomUUID(),
			channels: ["default"],
			username: user.username,
			joinedAt: Date.now()
		};
	},

	/**
	 * Called when the WebSocket connection is established
	 */
	async onConnect(ctx) {
		console.log(`[ChatConnection] User ${ctx.meta.username} connected`);

		// Join the chat room
		await ctx.actor.joinRoom("chat", {
			username: ctx.meta.username,
			joinedAt: ctx.meta.joinedAt
		});

		// Send welcome message to this connection
		ctx.emit.emit("system.message", {
			text: `Welcome to the chat, ${ctx.meta.username}!`,
			timestamp: Date.now()
		});

		// Broadcast to room that user joined
		await ctx.emit.toRoom("chat").emit("user.joined", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
			timestamp: Date.now()
		});

		// Request and send user list
		const roomStub = (ctx.actor as any).getRoomDO?.()?.get("chat");
		if (roomStub) {
			const members = await roomStub.getMembers();
			ctx.emit.emit("users.sync", {
				users: members.map((m: any) => m.userId),
				count: members.length
			});
		}
	},

	/**
	 * Called when the WebSocket connection is closed
	 */
	async onDisconnect(ctx) {
		console.log(`[ChatConnection] User ${ctx.meta.username} disconnected`);

		// Broadcast to room that user left
		await ctx.emit.toRoom("chat").emit("user.left", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
			timestamp: Date.now()
		});
	},

	/**
	 * Called when an error occurs
	 */
	onError(error, ctx) {
		console.error(`[ChatConnection] Error for ${ctx.meta.username}:`, error);
		ctx.emit.emit("error", { message: error.message });
	}
});

// ============================================================================
// Event Handlers (Socket.io-like)
// ============================================================================

/**
 * Handle chat message
 */
chatConnection.on<{ text: string }>("chat.message", async (ctx, data) => {
	const { text } = data;

	// Validate message
	if (!text || typeof text !== "string") {
		ctx.emit.emit("error", { message: "Invalid message format" });
		return;
	}

	if (text.length > 1000) {
		ctx.emit.emit("error", { message: "Message too long (max 1000 chars)" });
		return;
	}

	// Sanitize and broadcast
	const sanitized = text.trim();

	// Broadcast to room via RPC
	await ctx.emit.toRoom("chat").emit("chat.message", {
		from: ctx.meta.userId,
		username: ctx.meta.username,
		text: sanitized,
		timestamp: Date.now()
	});

	console.log(`[ChatConnection] ${ctx.meta.username}: ${sanitized}`);
});

/**
 * Handle typing indicator
 */
chatConnection.on("chat.typing", async (ctx, data) => {
	// Broadcast typing indicator to room
	await ctx.emit.toRoom("chat").emit("chat.typing", {
		from: ctx.meta.userId,
		username: ctx.meta.username,
		timestamp: Date.now()
	});
});

/**
 * Handle request for user list
 */
chatConnection.on("users.list", async (ctx, data) => {
	// Get room members from RoomDO
	const roomStub = (ctx.actor as any).getRoomDO?.()?.get("chat");
	if (roomStub) {
		const members = await roomStub.getMembers();
		ctx.emit.emit("users.sync", {
			users: members.map((m: any) => m.userId),
			count: members.length
		});
	}
});

// Export the connection handler
export const ChatConnectionDO = createConnectionHandler(chatConnection);

// Export the definition for reference
export { chatConnection };
