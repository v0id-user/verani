import { createActorHandler } from "./verani";
import { chatRoom } from "../examples/chat-room";
import { presenceRoom } from "../examples/presence-room";
import { notificationsRoom } from "../examples/notifications-room";

/**
 * Verani Examples Worker
 *
 * Routes WebSocket connections to different example rooms based on path:
 * - /chat -> Chat room example
 * - /presence -> Presence tracking example
 * - /notifications -> Personal notifications feed
 *
 * Also serves HTML clients for each example
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

		// Serve HTML clients
		if (path === "/") {
			return new Response(await getIndexHTML(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		if (path === "/chat.html") {
			return new Response(await getChatHTML(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		if (path === "/presence.html") {
			return new Response(await getPresenceHTML(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		if (path === "/notifications.html") {
			return new Response(await getNotificationsHTML(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		// 404 for other paths
		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Landing page HTML
 */
async function getIndexHTML(): Promise<string> {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Verani Examples</title>
	<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
	<div class="min-h-screen flex items-center justify-center p-4">
		<div class="max-w-4xl w-full">
			<div class="text-center mb-12">
				<h1 class="text-6xl font-bold text-gray-900 mb-4">Verani</h1>
				<p class="text-xl text-gray-600">Realtime SDK for Cloudflare Actors</p>
				<p class="text-gray-500 mt-2">Socket.io-like semantics with proper hibernation support</p>
			</div>

			<div class="grid md:grid-cols-3 gap-6">
				<!-- Chat Example -->
				<div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
					<div class="text-4xl mb-4">💬</div>
					<h2 class="text-2xl font-bold mb-2">Chat Room</h2>
					<p class="text-gray-600 mb-4">Real-time chat with typing indicators and online users</p>
					<ul class="text-sm text-gray-500 mb-4 space-y-1">
						<li>• Message broadcasting</li>
						<li>• Typing indicators</li>
						<li>• Online user list</li>
						<li>• Join/leave notifications</li>
					</ul>
					<a href="/chat.html" class="block w-full bg-blue-500 text-white text-center py-2 rounded hover:bg-blue-600 transition">
						Try Demo
					</a>
				</div>

				<!-- Presence Example -->
				<div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
					<div class="text-4xl mb-4">👥</div>
					<h2 class="text-2xl font-bold mb-2">Presence</h2>
					<p class="text-gray-600 mb-4">Track who's online with multi-device support</p>
					<ul class="text-sm text-gray-500 mb-4 space-y-1">
						<li>• Real-time presence</li>
						<li>• Multi-device tracking</li>
						<li>• Status updates</li>
						<li>• Device count</li>
					</ul>
					<a href="/presence.html" class="block w-full bg-green-500 text-white text-center py-2 rounded hover:bg-green-600 transition">
						Try Demo
					</a>
				</div>

				<!-- Notifications Example -->
				<div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
					<div class="text-4xl mb-4">🔔</div>
					<h2 class="text-2xl font-bold mb-2">Notifications</h2>
					<p class="text-gray-600 mb-4">Personal notification feed per user</p>
					<ul class="text-sm text-gray-500 mb-4 space-y-1">
						<li>• Personal feed</li>
						<li>• Push notifications</li>
						<li>• Read tracking</li>
						<li>• Multi-device sync</li>
					</ul>
					<a href="/notifications.html" class="block w-full bg-purple-500 text-white text-center py-2 rounded hover:bg-purple-600 transition">
						Try Demo
					</a>
				</div>
			</div>

			<div class="mt-12 text-center">
				<h3 class="text-lg font-semibold mb-4">Getting Started</h3>
				<div class="bg-white rounded-lg shadow p-6 text-left max-w-2xl mx-auto">
					<ol class="space-y-3 text-gray-700">
						<li><strong>1.</strong> Click on any example above</li>
						<li><strong>2.</strong> Enter a username (format: <code class="bg-gray-100 px-2 py-1 rounded">user:yourname</code>)</li>
						<li><strong>3.</strong> Open multiple tabs to see real-time sync</li>
					</ol>
				</div>
				<div class="mt-6">
					<a href="https://github.com/your-org/verani" class="text-blue-500 hover:underline">View Documentation →</a>
				</div>
			</div>
		</div>
	</div>
</body>
</html>`;
}

/**
 * Chat client HTML (embedded - in production, serve from separate files)
 */
async function getChatHTML(): Promise<string> {
	// We'll create this in the next step
	return "Chat client will be created in examples/clients/chat.html";
}

/**
 * Presence client HTML
 */
async function getPresenceHTML(): Promise<string> {
	return "Presence client will be created in examples/clients/presence.html";
}

/**
 * Notifications client HTML
 */
async function getNotificationsHTML(): Promise<string> {
	return "Notifications client will be created in examples/clients/notifications.html";
}
