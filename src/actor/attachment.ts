import type { ConnectionMeta } from "./types";

/**
 * Validates that a ConnectionMeta object has all required fields
 * @param meta - The metadata to validate
 * @returns true if valid, false otherwise
 */
export function isValidConnectionMeta(meta: unknown): meta is ConnectionMeta {
  if (meta === null || typeof meta !== 'object') {
    return false;
  }

  const obj = meta as Record<string, unknown>;

  // Check required fields
  if (typeof obj.userId !== 'string' || !obj.userId) {
    console.debug("[Verani:Attachment] Invalid userId:", obj.userId);
    return false;
  }

  if (typeof obj.clientId !== 'string' || !obj.clientId) {
    console.debug("[Verani:Attachment] Invalid clientId:", obj.clientId);
    return false;
  }

  if (!Array.isArray(obj.channels)) {
    console.debug("[Verani:Attachment] Invalid channels (not an array):", obj.channels);
    return false;
  }

  // Validate channels array contains only strings
  if (!obj.channels.every((ch: unknown) => typeof ch === 'string')) {
    console.debug("[Verani:Attachment] Invalid channels (contains non-string):", obj.channels);
    return false;
  }

  return true;
}

/**
 * Stores connection metadata as a WebSocket attachment for hibernation survival.
 * This allows the actor to restore session information when it wakes from hibernation.
 *
 * @param ws - The WebSocket connection to attach metadata to
 * @param meta - Connection metadata containing userId, clientId, and channels
 * @throws Error if serialization fails
 */
export function storeAttachment(ws: WebSocket, meta: ConnectionMeta) {
  console.debug("[Verani:Attachment][storeAttachment] Storing attachment:", { userId: meta.userId, clientId: meta.clientId, channels: meta.channels });
  ws.serializeAttachment(meta);
}

