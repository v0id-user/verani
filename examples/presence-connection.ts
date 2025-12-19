/**
 * Presence Connection Example (Per-Connection Architecture)
 *
 * This example demonstrates the per-connection DO pattern where:
 * - Each user gets their own ConnectionDO (identified by userId)
 * - Room coordination is handled by separate RoomDOs
 * - Message delivery uses DO-to-DO RPC
 *
 * Benefits:
 * - No single-threaded bottleneck
 * - Horizontal scalability
 * - Cost-efficient (idle connections hibernate)
 * - No message fanout from a single DO
 */

import { defineConnection, createConnectionHandler } from "../src/verani";
import type { ConnectionMeta } from "../src/verani";

/**
 * Extended metadata for presence tracking
 */
interface PresenceMeta extends ConnectionMeta {
	username: string;
	status: "online" | "away" | "busy";
	deviceInfo: string;
	connectedAt: number;
}

/**
 * Get device info from user agent
 */
function getDeviceInfo(req: Request): string {
	const ua = req.headers.get("User-Agent") || "";
	if (ua.includes("Mobile")) return "mobile";
	if (ua.includes("Tablet")) return "tablet";
	return "desktop";
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
 * Define the connection handler for presence tracking
 */
const presenceConnection = defineConnection<PresenceMeta>({
	name: "PresenceConnection",
	websocketPath: "/ws",

	/**
	 * Extract metadata from the WebSocket upgrade request
	 */
	extractMeta(req): PresenceMeta {
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
			status: "online",
			deviceInfo: getDeviceInfo(req),
			connectedAt: Date.now()
		};
	},

	/**
	 * Called when the WebSocket connection is established
	 */
	async onConnect(ctx) {
		console.log(`[PresenceConnection] User ${ctx.meta.username} connected from ${ctx.meta.deviceInfo}`);

		// Join the presence room (this registers with the RoomDO)
		await ctx.actor.joinRoom("presence", {
			username: ctx.meta.username,
			status: ctx.meta.status,
			deviceInfo: ctx.meta.deviceInfo
		});

		// Send welcome message to this connection
		ctx.emit.emit("presence.welcome", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
			message: "Welcome to the presence system!"
		});

		// Broadcast to room that user joined
		await ctx.emit.toRoom("presence").emit("presence.online", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
			status: ctx.meta.status,
			timestamp: Date.now()
		});
	},

	/**
	 * Called when the WebSocket connection is closed
	 */
	async onDisconnect(ctx) {
		console.log(`[PresenceConnection] User ${ctx.meta.username} disconnected`);

		// Broadcast to room that user went offline
		// Note: Room leave is handled automatically by ConnectionDO
		await ctx.emit.toRoom("presence").emit("presence.offline", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
			timestamp: Date.now()
		});
	},

	/**
	 * Called when an error occurs
	 */
	onError(error, ctx) {
		console.error(`[PresenceConnection] Error for ${ctx.meta.username}:`, error);
		ctx.emit.emit("error", { message: error.message });
	},

	/**
	 * Called after waking from hibernation (optional)
	 *
	 * Note: The SDK automatically handles:
	 * - Restoring WebSocket connection
	 * - Restoring room membership (with metadata)
	 * - Re-registering with all RoomDOs
	 *
	 * This hook is only needed for custom post-hibernation logic.
	 */
	async onHibernationRestore(actor) {
		console.log("[PresenceConnection] Restored from hibernation");
		// Room re-joining is handled automatically by the SDK!
		// Use this hook only for custom logic, e.g., sending a "reconnected" event
	}
});

// ============================================================================
// Event Handlers (Socket.io-like)
// ============================================================================

/**
 * Handle status change request
 */
presenceConnection.on("presence.status", async (ctx, data) => {
	const { status } = data;

	// Validate status
	if (!["online", "away", "busy"].includes(status)) {
		ctx.emit.emit("error", { message: "Invalid status" });
		return;
	}

	// Update local metadata
	ctx.meta.status = status;

	// Broadcast status change to room
	await ctx.emit.toRoom("presence").emit("presence.status", {
		userId: ctx.meta.userId,
		username: ctx.meta.username,
		status,
		timestamp: Date.now()
	});

	console.log(`[PresenceConnection] ${ctx.meta.username} changed status to ${status}`);
});

/**
 * Handle direct message to another user
 */
presenceConnection.on("dm", async (ctx, data) => {
	const { toUserId, message } = data;

	if (!toUserId || !message) {
		ctx.emit.emit("error", { message: "Missing toUserId or message" });
		return;
	}

	// Send directly to target user's ConnectionDO via RPC
	const sent = await ctx.emit.toUser(toUserId).emit("dm.received", {
		fromUserId: ctx.meta.userId,
		fromUsername: ctx.meta.username,
		message,
		timestamp: Date.now()
	});

	if (sent > 0) {
		// Confirm delivery to sender
		ctx.emit.emit("dm.sent", { toUserId, delivered: true });
	} else {
		ctx.emit.emit("dm.sent", { toUserId, delivered: false, reason: "User not connected" });
	}

	console.log(`[PresenceConnection] DM from ${ctx.meta.username} to ${toUserId}: ${message}`);
});

/**
 * Handle request for presence list
 */
presenceConnection.on("presence.list", async (ctx, data) => {
	// Get room members from RoomDO
	const roomStub = (ctx.actor as any).getRoomDO()?.get("presence");
	if (roomStub) {
		const members = await roomStub.getMembers();
		ctx.emit.emit("presence.sync", {
			users: members.map((m: any) => ({
				userId: m.userId,
				username: m.metadata?.username || m.userId,
				status: m.metadata?.status || "online",
				joinedAt: m.joinedAt
			})),
			totalUsers: members.length
		});
	}
});

// Export the connection handler
export const PresenceConnectionDO = createConnectionHandler(presenceConnection);

// Export the definition for reference
export { presenceConnection };
