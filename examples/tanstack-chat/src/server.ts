/**
 * Custom server entrypoint for TanStack Start + Verani
 *
 * Exports Durable Objects and intercepts /ws requests before
 * handing everything else to TanStack Start's default handler.
 */

import handler from "@tanstack/react-start/server-entry";
import { UserConnection } from "./chat-server";

export { UserConnection, ChatRoom } from "./chat-server";

export default {
	async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Route WebSocket upgrades to the connection DO
		if (url.pathname === "/ws") {
			const username = url.searchParams.get("username") ?? "anonymous";
			return UserConnection.get(username).fetch(request);
		}

		// Everything else → TanStack Start
		return handler.fetch(request, env, ctx);
	},
};
