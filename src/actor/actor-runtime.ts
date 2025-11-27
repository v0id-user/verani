import { Actor, ActorConfiguration } from "@cloudflare/actors";
import { restoreSessions, storeAttachment } from "./attachment";
import { decodeFrame, encodeFrame } from "./protocol";
import type { RoomDefinition, RoomContext, MessageContext, MessageFrame, BroadcastOptions, ConnectionMeta } from "./types";

/**
 * Sanitizes a room name or path to a valid PascalCase class name
 * @param name - The name to sanitize (e.g., "chat-example" or "/ws/presence")
 * @returns PascalCase class name (e.g., "ChatExample" or "WsPresence")
 */
function sanitizeToClassName(name: string): string {
	// Remove leading slashes and split by common separators
	const cleaned = name.replace(/^\/+/, '');
	const parts = cleaned.split(/[-_\/\s]+/);

	// Convert each part to PascalCase
	const pascalCase = parts
		.map(part => part.replace(/[^a-zA-Z0-9]/g, '')) // Remove special chars
		.filter(part => part.length > 0) // Remove empty parts
		.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join('');

	// Fallback if sanitization results in empty string
	return pascalCase || 'VeraniActor';
}

/**
 * Actor stub interface returned by .get() method
 */
export interface ActorStub {
	fetch(request: Request): Promise<Response>;
}

/**
 * Return type for createActorHandler - represents an Actor class constructor
 */
export type ActorHandlerClass<E = unknown> = {
	new(state: any, env: E): Actor<E>;
	get(id: string): ActorStub;
	configuration(request?: Request): ActorConfiguration;
};

/**
 * Creates an Actor handler from a room definition
 * @param room - The room definition with lifecycle hooks
 * @returns Actor class for Cloudflare Workers (extends DurableObject)
 */
export function createActorHandler<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>(
	room: RoomDefinition<TMeta, E>
): ActorHandlerClass<E> {
	// Determine class name with priority: room.name > room.websocketPath > "VeraniActor"
	const className = sanitizeToClassName(room.name || room.websocketPath || "VeraniActor");

	// Create named class dynamically
	class NamedActorClass extends Actor<E> {
		sessions = new Map<WebSocket, { ws: WebSocket; meta: TMeta }>();

		/**
		 * Static configuration method for Cloudflare Actors
		 * Specifies WebSocket upgrade path and other options
		 */
		static configuration(request?: Request): ActorConfiguration {
			const config: ActorConfiguration = {
				locationHint: "me",
				sockets: {
					upgradePath: room.websocketPath,
					autoResponse: {
						ping: 'ping',
						pong: 'pong'
					}
				}
			};

			console.debug("[Verani:ActorRuntime] configuration() called, request:", request ? request.url : "undefined");
			console.debug("[Verani:ActorRuntime] configuration() resolved config:", config);

			return config;
		}

		protected async shouldUpgradeWebSocket(request: Request): Promise<boolean> {
			return true;
		}

		// https://github.com/cloudflare/actors/issues/92
		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);
			const upgradeHeader = request.headers.get("Upgrade");

			if (url.pathname === room.websocketPath && upgradeHeader === 'websocket') {
				const shouldUpgrade = await this.shouldUpgradeWebSocket(request);
				if (shouldUpgrade) {
					return this.onWebSocketUpgrade(request);
				}
			}

			return this.onRequest(request);
		}


		/**
		 * Called when the Actor initializes or wakes from hibernation
		 * Restores sessions from WebSocket attachments
		 */
		protected async onInit() {
			console.debug("[Verani:ActorRuntime] onInit called");
			try {
				restoreSessions(this);
				console.debug("[Verani:ActorRuntime] Sessions restored, count:", this.sessions.size);

				// Call hibernation restore hook if defined
				if (room.onHibernationRestore && this.sessions.size > 0) {
					console.debug("[Verani:ActorRuntime] Calling onHibernationRestore hook");
					await room.onHibernationRestore(this);
					console.debug("[Verani:ActorRuntime] onHibernationRestore hook completed");
				}
			} catch (error) {
				console.error("[Verani] Failed to restore sessions:", error);
			}
		}

		/**
		 * Called when a new WebSocket connection is established
		 */
		protected onWebSocketConnect(ws: WebSocket, req: Request) {
			console.debug("[Verani:ActorRuntime] onWebSocketConnect called, url:", req.url);
			try {
				// Extract metadata from request
				let meta: TMeta;
				if (room.extractMeta) {
					meta = room.extractMeta(req) as TMeta;
					console.debug("[Verani:ActorRuntime] Extracted metadata:", { userId: meta.userId, clientId: meta.clientId, channels: meta.channels });
				} else {
					meta = {
						userId: "anonymous",
						clientId: crypto.randomUUID(),
						channels: ["default"]
					} as unknown as TMeta;
					console.debug("[Verani:ActorRuntime] Using default metadata:", meta);
				}

				// Store attachment for hibernation survival
				storeAttachment(ws, meta);

				// Add to in-memory sessions
				this.sessions.set(ws, { ws, meta });
				console.debug("[Verani:ActorRuntime] Session added, total sessions:", this.sessions.size);

				// Call user-defined onConnect hook
				if (room.onConnect) {
					console.debug("[Verani:ActorRuntime] Calling user onConnect hook");
					const ctx: RoomContext<TMeta, E> = {
						actor: this,
						ws,
						meta
					};
					room.onConnect(ctx);
					console.debug("[Verani:ActorRuntime] User onConnect hook completed");
				}
			} catch (error) {
				console.error("[Verani] Error in onWebSocketConnect:", error);

				// Call error handler if defined
				if (room.onError) {
					try {
						room.onError(error as Error, {
							actor: this,
							ws,
							meta: { userId: "unknown", clientId: "unknown", channels: [] } as unknown as TMeta
						});
					} catch (errorHandlerError) {
						console.error("[Verani] Error in onError handler:", errorHandlerError);
					}
				}

				// Close connection on critical errors
				ws.close(1011, "Internal server error");
			}
		}

		/**
		 * Called when a message is received from a WebSocket
		 */
		protected onWebSocketMessage(ws: WebSocket, raw: any) {
			let session: { ws: WebSocket; meta: TMeta } | undefined;

			try {
				// Decode the incoming frame
				const frame = decodeFrame(raw);
				console.debug("[Verani:ActorRuntime] Message received, type:", frame.type, "channel:", frame.channel);

				// Get session info
				session = this.sessions.get(ws);
				if (!session) {
					console.warn("[Verani] Received message from unknown session");
					return;
				}
				console.debug("[Verani:ActorRuntime] Session found:", { userId: session.meta.userId, clientId: session.meta.clientId });

				// Call user-defined onMessage hook
				if (room.onMessage) {
					console.debug("[Verani:ActorRuntime] Calling user onMessage hook");
					const ctx: MessageContext<TMeta, E> = {
						actor: this,
						ws,
						meta: session.meta,
						frame
					};
					room.onMessage(ctx, frame);
					console.debug("[Verani:ActorRuntime] User onMessage hook completed");
				}
			} catch (error) {
				console.error("[Verani] Error in onWebSocketMessage:", error);

				// Call error handler if defined
				if (room.onError && session) {
					try {
						room.onError(error as Error, {
							actor: this,
							ws,
							meta: session.meta
						});
					} catch (errorHandlerError) {
						console.error("[Verani] Error in onError handler:", errorHandlerError);
					}
				}
			}
		}

		/**
		 * Called when a WebSocket connection is closed
		 */
		protected onWebSocketDisconnect(ws: WebSocket) {
			console.debug("[Verani:ActorRuntime] onWebSocketDisconnect called");
			try {
				const session = this.sessions.get(ws);
				if (session) {
					console.debug("[Verani:ActorRuntime] Disconnecting session:", { userId: session.meta.userId, clientId: session.meta.clientId });
				}

				// Remove from sessions map
				this.sessions.delete(ws);
				console.debug("[Verani:ActorRuntime] Session removed, remaining sessions:", this.sessions.size);

				// Call user-defined onDisconnect hook
				if (session && room.onDisconnect) {
					console.debug("[Verani:ActorRuntime] Calling user onDisconnect hook");
					const ctx: RoomContext<TMeta, E> = {
						actor: this,
						ws,
						meta: session.meta
					};
					room.onDisconnect(ctx);
					console.debug("[Verani:ActorRuntime] User onDisconnect hook completed");
				}
			} catch (error) {
				console.error("[Verani] Error in onWebSocketDisconnect:", error);

				// Error handler is not called here since we may not have session context
			}
		}

		/**
		 * Broadcasts a message to all connections in a channel
		 * @param channel - The channel to broadcast to
		 * @param data - The data to send
		 * @param opts - Broadcast options (filtering, exclusions)
		 * @returns Number of connections that received the message
		 */
		broadcast(channel: string, data: any, opts?: BroadcastOptions): number {
			console.debug("[Verani:ActorRuntime] Broadcasting to channel:", channel, "options:", opts);
			let sentCount = 0;
			const frame: MessageFrame = { type: "event", channel, data };
			const encoded = encodeFrame(frame);

			for (const { ws, meta } of this.sessions.values()) {
				// Skip if channel filter doesn't match
				if (!meta.channels.includes(channel)) {
					continue;
				}

				// Skip if this is the excluded WebSocket
				if (opts?.except && ws === opts.except) {
					continue;
				}

				// Skip if userIds filter is specified and doesn't match
				if (opts?.userIds && !opts.userIds.includes(meta.userId)) {
					continue;
				}

				// Skip if clientIds filter is specified and doesn't match
				if (opts?.clientIds && !opts.clientIds.includes(meta.clientId)) {
					continue;
				}

				try {
					ws.send(encoded);
					sentCount++;
				} catch (error) {
					console.error("[Verani] Failed to send to WebSocket:", error);
				}
			}

			console.debug("[Verani:ActorRuntime] Broadcast complete, sent to:", sentCount, "sessions");
			return sentCount;
		}

		/**
		 * Gets the total number of active sessions
		 * @returns Number of connected WebSockets
		 */
		getSessionCount(): number {
			return this.sessions.size;
		}

		/**
		 * Gets all unique user IDs currently connected
		 * @returns Array of unique user IDs
		 */
		getConnectedUserIds(): string[] {
			const userIds = new Set<string>();
			for (const { meta } of this.sessions.values()) {
				userIds.add(meta.userId);
			}
			return Array.from(userIds);
		}

		/**
		 * Gets all sessions for a specific user
		 * @param userId - The user ID to filter by
		 * @returns Array of WebSockets belonging to the user
		 */
		getUserSessions(userId: string): WebSocket[] {
			const sockets: WebSocket[] = [];
			for (const { ws, meta } of this.sessions.values()) {
				if (meta.userId === userId) {
					sockets.push(ws);
				}
			}
			return sockets;
		}

		/**
		 * Sends a message to a specific user (all their sessions)
		 * @param userId - The user ID to send to
		 * @param type - Message type
		 * @param data - Message data
		 * @returns Number of sessions that received the message
		 */
		sendToUser(userId: string, channel: string, data?: any): number {
			console.debug("[Verani:ActorRuntime] Sending to user:", userId, "on channel:", channel);
			let sentCount = 0;
			const frame: MessageFrame = { type: "event", channel, data };
			const encoded = encodeFrame(frame);

			// Send only to sessions of that user which are subscribed to the channel
			for (const { ws, meta } of this.sessions.values()) {
				if (meta.userId === userId && meta.channels.includes(channel)) {
					try {
						ws.send(encoded);
						sentCount++;
					} catch (error) {
						console.error("[Verani] Failed to send to user:", error);
					}
				}
			}

			console.debug("[Verani:ActorRuntime] SendToUser complete, sent to:", sentCount, "sessions");
			return sentCount;
		}

		/**
		 * Gets the Durable Object storage interface
		 * @returns DurableObjectStorage instance
		 */
		getStorage(): DurableObjectStorage {
			return this.ctx.storage;
		}
	};

	// Set the name property for proper Actor binding resolution
	Object.defineProperty(NamedActorClass, 'name', {
		value: className,
		writable: false,
		configurable: true
	});

	return NamedActorClass as unknown as ActorHandlerClass<E>;
}
