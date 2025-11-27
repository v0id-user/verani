import type { RoomDefinition, ConnectionMeta } from "./types";

/**
 * Extracts user ID from request URL query parameters or headers
 * @param req - The incoming request
 * @returns userId or "anonymous" if not found
 */
function extractUserId(req: Request): string {
  const url = new URL(req.url);

  // Try query parameter first
  const userIdFromQuery = url.searchParams.get("userId") || url.searchParams.get("user_id");
  if (userIdFromQuery) {
    return userIdFromQuery;
  }

  // Try Authorization header (Bearer token pattern)
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // In a real app, you'd decode/verify the JWT here
    // For now, we just use it as an identifier
    return token;
  }

  // Try X-User-ID header
  const userIdHeader = req.headers.get("X-User-ID");
  if (userIdHeader) {
    return userIdHeader;
  }

  return "anonymous";
}

/**
 * Extracts client ID from request or generates a new one
 * @param req - The incoming request
 * @returns clientId (existing or newly generated)
 */
function extractClientId(req: Request): string {
  const url = new URL(req.url);

  // Try query parameter first
  const clientIdFromQuery = url.searchParams.get("clientId") || url.searchParams.get("client_id");
  if (clientIdFromQuery) {
    return clientIdFromQuery;
  }

  // Try X-Client-ID header
  const clientIdHeader = req.headers.get("X-Client-ID");
  if (clientIdHeader) {
    return clientIdHeader;
  }

  // Generate new client ID
  return crypto.randomUUID();
}

/**
 * Default metadata extraction function
 * @param req - The incoming WebSocket upgrade request
 * @returns Connection metadata with userId, clientId, and default channels
 */
function defaultExtractMeta(req: Request): ConnectionMeta {
  console.debug("[Verani:Router] Extracting metadata from request:", req.url);
  const userId = extractUserId(req);
  const clientId = extractClientId(req);
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
    extractMeta: def.extractMeta || (defaultExtractMeta as any),
    onConnect: def.onConnect,
    onDisconnect: def.onDisconnect,
    onMessage: def.onMessage,
    onError: def.onError
  };
}

/**
 * Helper to parse JWT tokens (basic implementation)
 * In production, use a proper JWT library
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function parseJWT(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
