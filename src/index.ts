import { Actor } from "@cloudflare/actors";
import { presenceRoom } from "../examples/presence-room";
import { CounterActor } from "../examples/persistence/counter-room";
import { createActorHandler } from "./actor/actor-runtime";
import { createConnectionHandler, defineConnection } from "./actor/connection-actor";
import { createRoomHandler, type RoomActorStub } from "./actor/room-actor";

// ============================================================================
// Legacy Examples (Global Router Pattern - Deprecated)
// These use the old architecture where all connections go to a single DO.
// Kept for backward compatibility.
// ============================================================================
export const PresenceExample = createActorHandler(presenceRoom);
export class ChatExample extends Actor<Env> {}
export class NotificationsExample extends Actor<Env> {}
export { CounterActor };

// ============================================================================
// New Architecture Examples (Per-Connection Pattern)
// Each user gets their own ConnectionDO, with RoomDOs for coordination.
// ============================================================================

/**
 * Extract userId from request
 * Supports: ?token=user:xxx, ?userId=xxx, or generates random UUID
 */
function extractUserId(request: Request): string {
	const url = new URL(request.url);

	// Try token parameter (format: user:userId)
	const token = url.searchParams.get("token");
	if (token) {
		const parts = token.split(":");
		if (parts.length === 2 && parts[0] === "user") {
			return parts[1];
		}
	}

	// Try direct userId parameter
	const userId = url.searchParams.get("userId");
	if (userId) {
		return userId;
	}

	// Fallback: generate a random userId
	// Note: In production, you'd want to require authentication
	return crypto.randomUUID();
}

/**
 * ConnectionDO for per-user WebSocket connections
 * Each user gets their own DO instance identified by userId
 */
const connectionDef = defineConnection({
	name: "UserConnection",
	websocketPath: "/ws",

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

		return {
			userId,
			clientId: crypto.randomUUID(),
			channels: ["default"],
			username
		} as any;
	},

	async onConnect(ctx) {
		console.log(`[UserConnection] User ${ctx.meta.userId} connected`);

		// Auto-join presence room
		try {
			await ctx.actor.joinRoom("presence", { username: (ctx.meta as any).username });
		} catch (error) {
			console.error("[UserConnection] Failed to join presence room:", error);
		}
	},

	async onDisconnect(ctx) {
		console.log(`[UserConnection] User ${ctx.meta.userId} disconnected`);
		// Room leave is handled automatically in connection-actor.ts
	}
});

// Register event handlers with typed data
connectionDef.on<{ text: string }>("chat", async (ctx, data) => {
	console.log(`[UserConnection] Chat message from ${ctx.meta.userId}:`, data);
	// Broadcast to room via RPC
	await ctx.emit.toRoom("chat").emit("chat:message", {
		from: ctx.meta.userId,
		text: data.text,
		timestamp: Date.now()
	});
});

connectionDef.on<{ status: string }>("presence.status", async (ctx, data) => {
	// Update presence status in room
	// Note: getRoomDO is available on the actor but not exposed in the public interface
	const actor = ctx.actor as unknown as { getRoomDO?: () => { get: (name: string) => RoomActorStub } };
	const roomStub = actor.getRoomDO?.()?.get("presence");
	if (roomStub) {
		await roomStub.updateMemberMetadata(ctx.meta.userId, { status: data.status });
		await roomStub.broadcast("presence.status", {
			userId: ctx.meta.userId,
			status: data.status,
			timestamp: Date.now()
		});
	}
});

export const UserConnection = createConnectionHandler(connectionDef);

/**
 * RoomDO for presence coordination
 * Manages room membership and broadcasts presence updates
 */
export const PresenceRoom = createRoomHandler({
	name: "PresenceRoom",

	async onJoin(roomState, userId, metadata) {
		console.log(`[PresenceRoom] User ${userId} joined with metadata:`, metadata);
	},

	async onLeave(roomState, userId) {
		console.log(`[PresenceRoom] User ${userId} left`);
	}
});

/**
 * RoomDO for chat coordination
 */
export const ChatRoom = createRoomHandler({
	name: "ChatRoom"
});

// ============================================================================
// Worker Fetch Handler
// ============================================================================
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// ====================================================================
		// New Architecture Routes (Per-Connection Pattern)
		// Route to per-user ConnectionDO using userId as the DO identifier
		// ====================================================================

		if (path.startsWith("/ws/v2/")) {
			const userId = extractUserId(request);
			console.log(`[Worker] Routing to ConnectionDO for user: ${userId}`);

			// Get the user's dedicated ConnectionDO
			const stub = UserConnection.get(userId);
			return stub.fetch(request);
		}

		// ====================================================================
		// Legacy Routes (Global Router Pattern - Deprecated)
		// These use the old architecture where all connections go to one DO
		// ====================================================================

		if (path.startsWith("/ws/presence")) {
			// DEPRECATED: Global router pattern - all users share one DO
			const stub = PresenceExample.get("");
			return stub.fetch(request);
		}

		if (path.startsWith("/ws/counter")) {
			// DEPRECATED: Global router pattern - all users share one DO
			const stub = CounterActor.get("");
			return stub.fetch(request);
		}

		// Info page for root path
		if (path === "/" || path === "/index.html") {
			return new Response(getInfoPage(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		// 404 for other paths
		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Simple info page explaining how to use the examples
 */
function getInfoPage(): string {
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
		a { color: #2563eb; text-decoration: none; }
		a:hover { text-decoration: underline; }
	</style>
</head>
<body>
	<h1>🚀 Verani Examples</h1>
	<p>Real-time SDK for Cloudflare Actors with Socket.io-like semantics and proper hibernation support.</p>

	<h2>📦 Running Examples</h2>
	<p>This worker provides WebSocket endpoints for the example rooms. To interact with them, use the TypeScript CLI clients.</p>

	<div class="example">
		<h3>💬 Chat Room</h3>
		<pre><code>bun run examples/clients/chat-client.ts</code></pre>
		<p>Real-time chat with typing indicators, online users, and message broadcasting. Each instance uses a random username.</p>
	</div>

	<div class="example">
		<h3>👥 Presence Tracking</h3>
		<pre><code>bun run examples/clients/presence-client.ts</code></pre>
		<p>Track who's online with multi-device support and status indicators. Each instance uses a random username.</p>
	</div>

	<div class="example">
		<h3>Persistent Counter</h3>
		<pre><code>bun run examples/persistence/counter-client.ts</code></pre>
		<p>Demonstrates state persistence across Actor hibernation. Counter value survives server restarts!</p>
	</div>

	<div class="example">
		<h3>Notifications Feed</h3>
		<pre><code>bun run examples/clients/notifications-client.ts</code></pre>
		<p>Personal notification stream with read/unread tracking and multi-device sync. Each instance uses a random username.</p>
	</div>

	<h2>WebSocket Endpoints</h2>
	<ul>
		<li><code>/ws/chat</code> - Chat room endpoint</li>
		<li><code>/ws/presence</code> - Presence tracking endpoint</li>
		<li><code>/ws/counter</code> - Persistent counter endpoint</li>
		<li><code>/ws/notifications</code> - Notifications feed endpoint (requires userId param)</li>
	</ul>

	<h2>Documentation</h2>
	<ul>
		<li><a href="https://github.com/v0id-user/verani">GitHub Repository</a></li>
		<li>Examples README: <code>examples/README.md</code></li>
		<li>API Documentation: <code>docs/API.md</code></li>
	</ul>

	<h2>Development</h2>
	<p>Make sure to run <code>wrangler dev</code> to start the server before running clients.</p>
	<p>Default development URL: <strong>http://localhost:8787</strong></p>
</body>
</html>`;
}
