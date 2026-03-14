import type { ConnectionMeta } from "./types";

/**
 * Validates that a ConnectionMeta object has all required fields
 */
export function isValidConnectionMeta(meta: unknown): meta is ConnectionMeta {
  if (meta === null || typeof meta !== 'object') {
    return false;
  }

  const obj = meta as Record<string, unknown>;

  if (typeof obj.userId !== 'string' || !obj.userId) return false;
  if (typeof obj.clientId !== 'string' || !obj.clientId) return false;
  if (!Array.isArray(obj.channels)) return false;
  if (!obj.channels.every((ch: unknown) => typeof ch === 'string')) return false;

  return true;
}

/**
 * Stores connection metadata as a WebSocket attachment for hibernation survival.
 */
export function storeAttachment(ws: WebSocket, meta: ConnectionMeta) {
  ws.serializeAttachment(meta);
}
