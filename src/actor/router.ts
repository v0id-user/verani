import type { RoomDefinition, ConnectionMeta } from "./types";


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
 * Defines a room with lifecycle hooks and metadata extraction
 * @param def - Room definition with optional hooks
 * @returns Normalized room definition with defaults
 */
export function defineRoom<TMeta extends ConnectionMeta = ConnectionMeta>(
  def: RoomDefinition<TMeta>
): RoomDefinition<TMeta> {
  return {
    name: def.name,
    websocketPath: def.websocketPath,
    extractMeta: def.extractMeta || (defaultExtractMeta as any),
    onConnect: def.onConnect,
    onDisconnect: def.onDisconnect,
    onMessage: def.onMessage,
    onError: def.onError
  };
}
