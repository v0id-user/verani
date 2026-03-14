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
	WEBSOCKET_PATH
} from "../examples/server";

// Re-export Durable Objects for wrangler.jsonc
export { UserConnection, PresenceRoom, ChatRoom };

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith(WEBSOCKET_PATH)) {
			const userId = extractUserId(request);
			return UserConnection.get(userId).fetch(request);
		}

		if (url.pathname === "/" || url.pathname === "/index.html") {
			return new Response(getInfoPage(), {
				headers: { "Content-Type": "text/html" }
			});
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
