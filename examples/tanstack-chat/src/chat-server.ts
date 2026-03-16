/**
 * Verani chat server — Durable Object definitions
 *
 * These are exported from server.ts so Cloudflare Workers
 * can bind them as Durable Objects.
 */

import { defineConnection, createConnectionHandler, createRoomHandler } from "verani";

interface ChatMeta {
	userId: string;
	clientId: string;
	channels: string[];
	username: string;
}

const chat = defineConnection<ChatMeta>({
	name: "UserConnection",
	websocketPath: "/ws",
	rooms: { chat: "ChatRoom" },
	connectionBinding: "UserConnection",

	extractMeta(req) {
		const url = new URL(req.url);
		const username = url.searchParams.get("username") ?? `anon-${crypto.randomUUID().slice(0, 6)}`;
		return {
			userId: username,
			clientId: crypto.randomUUID(),
			channels: ["default"],
			username,
		};
	},

	async onConnect(ctx) {
		await ctx.actor.joinRoom("chat", { username: ctx.meta.username });

		ctx.emit.emit("welcome", {
			username: ctx.meta.username,
		});

		await ctx.emit.toRoom("chat").emit("user:joined", {
			username: ctx.meta.username,
			timestamp: Date.now(),
		});
	},

	async onDisconnect(ctx) {
		await ctx.emit.toRoom("chat").emit("user:left", {
			username: ctx.meta.username,
			timestamp: Date.now(),
		});
	},
});

chat.on<{ text: string }>("message", async (ctx, data) => {
	if (!data.text || typeof data.text !== "string") return;
	const text = data.text.trim().slice(0, 500);
	if (!text) return;

	await ctx.emit.toRoom("chat").emit("message", {
		username: ctx.meta.username,
		text,
		timestamp: Date.now(),
	});
});

chat.on("typing", async (ctx) => {
	await ctx.emit.toRoom("chat", { exceptUserId: ctx.meta.userId }).emit("typing", {
		username: ctx.meta.username,
	});
});

export const UserConnection = createConnectionHandler(chat);

export const ChatRoom = createRoomHandler({
	name: "ChatRoom",
	connectionBinding: "UserConnection",
});
