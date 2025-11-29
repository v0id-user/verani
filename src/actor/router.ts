import type { RoomDefinition, ConnectionMeta, EventHandler } from "./types";
import { createRoomEventEmitter } from "./runtime/eventEmitter";


/**
 * Default metadata extraction function
 * @param req - The incoming WebSocket upgrade request
 * @returns Connection metadata with userId, clientId, and default channels
 */
function defaultExtractMeta(req: Request): ConnectionMeta {
  console.debug("[Verani:Router] Extracting metadata from request:", req.url);
  const userId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  console.debug("[Verani:Router] Extracted userId:", userId, "clientId:", clientId);

  // Extract initial channels from query parameters
  const url = new URL(req.url);
  const channelsParam = url.searchParams.get("channels");
  const channels = channelsParam
    ? channelsParam.split(",").map(c => c.trim()).filter(Boolean)
    : ["default"];
  console.debug("[Verani:Router] Extracted channels:", channels);

  return {
    userId,
    clientId,
    channels
  };
}

/**
 * Extended room definition with socket.io-like convenience methods
 */
export interface RoomDefinitionWithHandlers<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>
  extends RoomDefinition<TMeta, E> {
  /**
   * Register an event handler (socket.io-like API)
   * @param event - Event name
   * @param handler - Handler function
   */
  on(event: string, handler: EventHandler<TMeta, E>): void;

  /**
   * Remove an event handler (socket.io-like API)
   * @param event - Event name
   * @param handler - Optional specific handler to remove
   */
  off(event: string, handler?: EventHandler<TMeta, E>): void;
}

/**
 * Defines a room with lifecycle hooks and metadata extraction
 * @param def - Room definition with optional hooks
 * @returns Normalized room definition with defaults and socket.io-like event handler methods
 */
export function defineRoom<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>(
  def: RoomDefinition<TMeta, E>
): RoomDefinitionWithHandlers<TMeta, E> {
  // Create default event emitter if not provided
  const eventEmitter = def.eventEmitter || createRoomEventEmitter<TMeta, E>();

  const room: RoomDefinitionWithHandlers<TMeta, E> = {
    name: def.name,
    websocketPath: def.websocketPath,
    extractMeta: def.extractMeta || ((req: Request) => defaultExtractMeta(req) as TMeta),
    onConnect: def.onConnect,
    onDisconnect: def.onDisconnect,
    onMessage: def.onMessage,
    onError: def.onError,
    onHibernationRestore: def.onHibernationRestore,
    eventEmitter,
    // Socket.io-like convenience methods
    on(event: string, handler: EventHandler<TMeta, E>): void {
      eventEmitter.on(event, handler);
    },
    off(event: string, handler?: EventHandler<TMeta, E>): void {
      eventEmitter.off(event, handler);
    }
  };

  return room;
}
