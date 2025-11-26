import { createActorHandler } from "./verani";
import { chatRoom } from "../examples/chat-room";
import { presenceRoom } from "../examples/presence-room";
import { notificationsRoom } from "../examples/notifications-room";

/**
 * Verani Examples Worker
 *
 * Routes WebSocket connections to different example rooms based on path:
 * - /ws/chat -> Chat room example
 * - /ws/presence -> Presence tracking example
 * - /ws/notifications -> Personal notifications feed
 *
 * TypeScript CLI clients available in examples/clients/
 * Run with: bun run examples/clients/<client-name>.ts user:yourname
 */

// Environment bindings interface
interface Env {
	CHAT: DurableObjectNamespace;
	PRESENCE: DurableObjectNamespace;
	NOTIFICATIONS: DurableObjectNamespace;
}

// Create handlers for each room
const ChatRoom = createActorHandler(chatRoom);
const PresenceRoom = createActorHandler(presenceRoom);
const NotificationsRoom = createActorHandler(notificationsRoom);

// Export all Durable Object classes (Wrangler requirement)
// Each export name MUST match its corresponding "class_name" in wrangler.jsonc
export const Verani = ChatRoom;
export { ChatRoom, PresenceRoom, NotificationsRoom };

// Export default handler with routing logic
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Handle WebSocket upgrades by routing to appropriate Durable Object
		if (path.startsWith("/ws/chat")) {
			const id = env.CHAT.idFromName("chat-room");
			const stub = env.CHAT.get(id);
			return stub.fetch(request);
		}

		if (path.startsWith("/ws/presence")) {
			const id = env.PRESENCE.idFromName("presence-room");
			const stub = env.PRESENCE.get(id);
			return stub.fetch(request);
		}

		if (path.startsWith("/ws/notifications")) {
			const userId = url.searchParams.get("userId") || "anonymous";
			const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
			const stub = env.NOTIFICATIONS.get(id);
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
		<pre><code>bun run examples/clients/chat-client.ts user:alice</code></pre>
		<p>Real-time chat with typing indicators, online users, and message broadcasting.</p>
	</div>

	<div class="example">
		<h3>👥 Presence Tracking</h3>
		<pre><code>bun run examples/clients/presence-client.ts user:bob</code></pre>
		<p>Track who's online with multi-device support and status indicators.</p>
	</div>

	<div class="example">
		<h3>🔔 Notifications Feed</h3>
		<pre><code>bun run examples/clients/notifications-client.ts user:charlie</code></pre>
		<p>Personal notification stream with read/unread tracking and multi-device sync.</p>
	</div>

	<h2>🔗 WebSocket Endpoints</h2>
	<ul>
		<li><code>/ws/chat</code> - Chat room endpoint</li>
		<li><code>/ws/presence</code> - Presence tracking endpoint</li>
		<li><code>/ws/notifications</code> - Notifications feed endpoint (requires userId param)</li>
	</ul>

	<h2>📚 Documentation</h2>
	<ul>
		<li><a href="https://github.com/your-org/verani">GitHub Repository</a></li>
		<li>Examples README: <code>examples/README.md</code></li>
		<li>API Documentation: <code>docs/API.md</code></li>
	</ul>

	<h2>🛠️ Development</h2>
	<p>Make sure to run <code>wrangler dev</code> to start the server before running clients.</p>
	<p>Default development URL: <strong>http://localhost:8787</strong></p>
</body>
</html>`;
}
