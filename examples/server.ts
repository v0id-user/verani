/**
 * Verani Examples - Server Entry Point
 *
 * This file demonstrates the per-connection architecture where:
 * - Each user gets their own ConnectionDO (identified by userId)
 * - Room coordination is handled by separate RoomDOs
 * - Message delivery uses DO-to-DO RPC
 */

import { defineConnection, createConnectionHandler } from "../src/actor/connection-actor";
import { createRoomHandler, type RoomActorStub } from "../src/actor/room-actor";

// ============================================================================
// Configuration
// ============================================================================

/** WebSocket path for all connections */
export const WEBSOCKET_PATH = "/ws";

/** Name for the user connection DO */
export const CONNECTION_NAME = "UserConnection";

/** Name for the presence room DO */
export const PRESENCE_ROOM_NAME = "PresenceRoom";

/** Name for the chat room DO */
export const CHAT_ROOM_NAME = "ChatRoom";

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract userId from request
 * Supports: ?token=user:xxx, ?userId=xxx, or generates random UUID
 */
export function extractUserId(request: Request): string {
	const url = new URL(request.url);

	// Try token parameter (format: user:userId)
	const token = url.searchParams.get("token");
	if (token) {
		const parts = token.split(":");
		if (parts.length === 2 && parts[0] === "user") {
			const userId = parts[1];
			console.log(`[extractUserId] Extracted userId from token: ${userId}`);
			return userId;
		}
	}

	// Try direct userId parameter
	const userId = url.searchParams.get("userId");
	if (userId) {
		console.log(`[extractUserId] Extracted userId from param: ${userId}`);
		return userId;
	}

	// Fallback: generate a random userId
	const randomId = crypto.randomUUID();
	console.log(`[extractUserId] Generated random userId: ${randomId}`);
	return randomId;
}

// ============================================================================
// Connection Definition
// ============================================================================

/**
 * Connection metadata interface
 */
interface UserConnectionMeta {
	userId: string;
	clientId: string;
	channels: string[];
	username: string;
}

/**
 * Define the user connection handler
 * Each user gets their own ConnectionDO instance
 */
const userConnectionDef = defineConnection<UserConnectionMeta>({
	name: CONNECTION_NAME,
	websocketPath: WEBSOCKET_PATH,

	extractMeta(req) {
		const url = new URL(req.url);
		const token = url.searchParams.get("token");
		let userId = "anonymous";
		let username = "anonymous";

		if (token) {
			const parts = token.split(":");
			if (parts.length === 2 && parts[0] === "user") {
				userId = parts[1];
				username = parts[1];
			}
		}

		const clientId = crypto.randomUUID();
		const channels = ["default"];

		console.log(`[${CONNECTION_NAME}] extractMeta:`, {
			userId,
			clientId,
			channels,
			username
		});

		return { userId, clientId, channels, username };
	},

	async onConnect(ctx) {
		const { userId, username } = ctx.meta;
		console.log(`[${CONNECTION_NAME}] onConnect: userId=${userId}, username=${username}`);

		// Auto-join presence room
		try {
			await ctx.actor.joinRoom("presence", { username });
			console.log(`[${CONNECTION_NAME}] User ${userId} joined presence room`);
		} catch (error) {
			console.error(`[${CONNECTION_NAME}] Failed to join presence room:`, error);
		}
	},

	async onDisconnect(ctx) {
		const { userId, username } = ctx.meta;
		console.log(`[${CONNECTION_NAME}] onDisconnect: userId=${userId}, username=${username}`);
		// Room leave is handled automatically
	}
});

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle chat messages
 */
userConnectionDef.on<{ text: string }>("chat", async (ctx, data) => {
	const { userId, username } = ctx.meta;
	const { text } = data;

	console.log(`[${CONNECTION_NAME}] chat event:`, {
		from: userId,
		username,
		text,
		timestamp: Date.now()
	});

	// Broadcast to room via RPC
	await ctx.emit.toRoom("chat").emit("chat:message", {
		from: userId,
		text,
		timestamp: Date.now()
	});
});

/**
 * Handle presence status updates
 */
userConnectionDef.on<{ status: string }>("presence.status", async (ctx, data) => {
	const { userId, username } = ctx.meta;
	const { status } = data;

	console.log(`[${CONNECTION_NAME}] presence.status event:`, {
		userId,
		username,
		status,
		timestamp: Date.now()
	});

	// Update presence status in room
	const actor = ctx.actor as unknown as { getRoomDO?: () => { get: (name: string) => RoomActorStub } };
	const roomStub = actor.getRoomDO?.()?.get("presence");
	if (roomStub) {
		await roomStub.updateMemberMetadata(userId, { status });
		await roomStub.broadcast("presence.status", {
			userId,
			status,
			timestamp: Date.now()
		});
	}
});

// ============================================================================
// Export Connection Handler
// ============================================================================

/** User Connection DO - one per user */
export const UserConnection = createConnectionHandler(userConnectionDef);

// ============================================================================
// Room Handlers
// ============================================================================

/**
 * Presence Room Coordinator
 * Manages room membership and broadcasts presence updates
 */
export const PresenceRoom = createRoomHandler({
	name: PRESENCE_ROOM_NAME,

	async onJoin(roomState, userId, metadata) {
		console.log(`[${PRESENCE_ROOM_NAME}] onJoin:`, {
			userId,
			metadata,
			timestamp: Date.now()
		});
	},

	async onLeave(roomState, userId) {
		console.log(`[${PRESENCE_ROOM_NAME}] onLeave:`, {
			userId,
			timestamp: Date.now()
		});
	}
});

/**
 * Chat Room Coordinator
 * Manages chat room membership
 */
export const ChatRoom = createRoomHandler({
	name: CHAT_ROOM_NAME,

	async onJoin(roomState, userId, metadata) {
		console.log(`[${CHAT_ROOM_NAME}] onJoin:`, {
			userId,
			metadata,
			timestamp: Date.now()
		});
	},

	async onLeave(roomState, userId) {
		console.log(`[${CHAT_ROOM_NAME}] onLeave:`, {
			userId,
			timestamp: Date.now()
		});
	}
});

// ============================================================================
// Info Page
// ============================================================================

/**
 * Generate HTML info page
 */
export function getInfoPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Verani Examples</title>
	<style>
		body {
			font-family: system-ui, -apple-system, sans-serif;
			max-width: 800px;
			margin: 40px auto;
			padding: 0 20px;
			line-height: 1.6;
			color: #333;
		}
		h1 { color: #2563eb; }
		h2 { color: #1e40af; margin-top: 30px; }
		code {
			background: #f3f4f6;
			padding: 2px 6px;
			border-radius: 3px;
			font-family: 'Courier New', monospace;
		}
		pre {
			background: #1f2937;
			color: #f9fafb;
			padding: 15px;
			border-radius: 6px;
			overflow-x: auto;
		}
		pre code {
			background: none;
			color: inherit;
			padding: 0;
		}
		.example {
			background: #f9fafb;
			border-left: 4px solid #2563eb;
			padding: 15px;
			margin: 15px 0;
		}
		.config {
			background: #fef3c7;
			border-left: 4px solid #f59e0b;
			padding: 15px;
			margin: 15px 0;
		}
		a { color: #2563eb; text-decoration: none; }
		a:hover { text-decoration: underline; }
	</style>
</head>
<body>
	<h1>Verani Examples</h1>
	<p>Real-time SDK for Cloudflare Actors with Socket.io-like semantics and proper hibernation support.</p>

	<h2>Architecture</h2>
	<p>This example uses the <strong>per-connection architecture</strong> where each user gets their own ConnectionDO, with separate RoomDOs for coordination.</p>

	<div class="config">
		<h3>Current Configuration</h3>
		<ul>
			<li><strong>WebSocket Path:</strong> <code>${WEBSOCKET_PATH}</code></li>
			<li><strong>Connection DO:</strong> <code>${CONNECTION_NAME}</code></li>
			<li><strong>Presence Room DO:</strong> <code>${PRESENCE_ROOM_NAME}</code></li>
			<li><strong>Chat Room DO:</strong> <code>${CHAT_ROOM_NAME}</code></li>
		</ul>
	</div>

	<h2>Running Examples</h2>
	<p>This worker provides WebSocket endpoints for the example rooms. To interact with them, use the TypeScript CLI clients.</p>

	<div class="example">
		<h3>Presence Tracking</h3>
		<pre><code>bun run examples/clients/presence-client.ts</code></pre>
		<p>Track who's online with multi-device support and status indicators.</p>
	</div>

	<div class="example">
		<h3>Chat Room</h3>
		<pre><code>bun run examples/clients/chat-client.ts</code></pre>
		<p>Real-time chat with typing indicators, online users, and message broadcasting.</p>
	</div>

	<h2>WebSocket Endpoint</h2>
	<p>All connections go to: <code>${WEBSOCKET_PATH}</code></p>
	<p>Authentication via query param: <code>?token=user:username</code></p>

	<h2>Documentation</h2>
	<ul>
		<li><a href="https://github.com/v0id-user/verani">GitHub Repository</a></li>
		<li>Examples README: <code>examples/README.md</code></li>
		<li>API Documentation: <code>docs/api/server.md</code></li>
	</ul>

	<h2>Development</h2>
	<p>Make sure to run <code>wrangler dev</code> to start the server before running clients.</p>
	<p>Default development URL: <strong>http://localhost:8787</strong></p>
</body>
</html>`;
}
