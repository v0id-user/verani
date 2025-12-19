/**
 * Verani Worker Entry Point
 *
 * This file imports examples from the examples folder and exports them
 * for Cloudflare Workers. All logic is defined in examples/server.ts.
 */

import {
	UserConnection,
	PresenceRoom,
	ChatRoom,
	extractUserId,
	getInfoPage,
	WEBSOCKET_PATH,
	CONNECTION_NAME,
	PRESENCE_ROOM_NAME,
	CHAT_ROOM_NAME
} from "../examples/server";

// ============================================================================
// Re-export Durable Objects for wrangler.jsonc
// ============================================================================

export { UserConnection, PresenceRoom, ChatRoom };

// ============================================================================
// Worker Fetch Handler
// ============================================================================

const WORKER_NAME = "VeraniWorker";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		console.log(`[${WORKER_NAME}] Request: method=${method}, path=${path}`);
		console.log(`[${WORKER_NAME}] Config: websocketPath=${WEBSOCKET_PATH}, connectionDO=${CONNECTION_NAME}, presenceRoom=${PRESENCE_ROOM_NAME}, chatRoom=${CHAT_ROOM_NAME}`);

		// Route WebSocket connections to per-user ConnectionDO
		if (path.startsWith(WEBSOCKET_PATH)) {
			const userId = extractUserId(request);
			const connectionDO = CONNECTION_NAME;

			console.log(`[${WORKER_NAME}] WebSocket route matched: path=${path}, websocketPath=${WEBSOCKET_PATH}`);
			console.log(`[${WORKER_NAME}] Routing to DO: connectionDO=${connectionDO}, userId=${userId}`);

			const stub = UserConnection.get(userId);
			const response = stub.fetch(request);

			console.log(`[${WORKER_NAME}] Forwarded to ${connectionDO}: userId=${userId}`);

			return response;
		}

		// Info page for root path
		const rootPath = "/";
		const indexPath = "/index.html";

		if (path === rootPath || path === indexPath) {
			console.log(`[${WORKER_NAME}] Info page route matched: path=${path}`);

			const html = getInfoPage();
			const contentType = "text/html";

			console.log(`[${WORKER_NAME}] Serving info page: contentType=${contentType}, length=${html.length}`);

			return new Response(html, {
				headers: { "Content-Type": contentType }
			});
		}

		// 404 for other paths
		const notFoundStatus = 404;
		const notFoundMessage = "Not Found";

		console.log(`[${WORKER_NAME}] No route matched: path=${path}, status=${notFoundStatus}`);

		return new Response(notFoundMessage, { status: notFoundStatus });
	},
} satisfies ExportedHandler<Env>;
