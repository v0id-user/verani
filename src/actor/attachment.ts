import type { ConnectionMeta } from "./types";

/**
 * Validates that a ConnectionMeta object has all required fields
 * @param meta - The metadata to validate
 * @returns true if valid, false otherwise
 */
export function isValidConnectionMeta(meta: any): meta is ConnectionMeta {
  if (!meta || typeof meta !== 'object') {
    return false;
  }

  // Check required fields
  if (typeof meta.userId !== 'string' || !meta.userId) {
    console.debug("[Verani:Attachment] Invalid userId:", meta.userId);
    return false;
  }

  if (typeof meta.clientId !== 'string' || !meta.clientId) {
    console.debug("[Verani:Attachment] Invalid clientId:", meta.clientId);
    return false;
  }

  if (!Array.isArray(meta.channels)) {
    console.debug("[Verani:Attachment] Invalid channels (not an array):", meta.channels);
    return false;
  }

  // Validate channels array contains only strings
  if (!meta.channels.every((ch: any) => typeof ch === 'string')) {
    console.debug("[Verani:Attachment] Invalid channels (contains non-string):", meta.channels);
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

/**
 * Restores WebSocket sessions from hibernation by deserializing attachments.
 * Only restores sessions that are in OPEN state and have valid metadata.
 * Sessions with invalid or missing metadata are skipped.
 *
 * @param actor - The actor instance with a sessions Map and ctx.getWebSockets() method
 * @returns void - Sessions are added directly to actor.sessions Map
 * @throws Error if deserialization fails critically (individual failures are logged and skipped)
 */
export function restoreSessions(actor: any) {
  console.debug("[Verani:Attachment][restoreSessions] Restoring sessions from hibernation");
  let restoredCount = 0;
  let skippedCount = 0;

  for (const ws of actor.ctx.getWebSockets()) {
    // Check if WebSocket is in OPEN state
    if (ws.readyState !== WebSocket.OPEN) {
      console.debug("[Verani:Attachment][restoreSessions] WebSocket not in OPEN state, skipping. State:", ws.readyState);
      skippedCount++;
      continue;
    }

    // Deserialize and validate attachment
    const meta = ws.deserializeAttachment() as ConnectionMeta | undefined;
    if (!meta) {
      console.debug("[Verani:Attachment][restoreSessions] WebSocket has no attachment, skipping");
      skippedCount++;
      continue;
    }

    // Validate metadata structure
    if (!isValidConnectionMeta(meta)) {
      console.warn("[Verani:Attachment][restoreSessions] Invalid metadata structure, skipping session");
      skippedCount++;
      continue;
    }

    console.debug("[Verani:Attachment][restoreSessions] Restored session:", { userId: meta.userId, clientId: meta.clientId });
    actor.sessions.set(ws, { ws, meta });
    restoredCount++;
  }

  console.debug("[Verani:Attachment][restoreSessions] Restored", restoredCount, "sessions,", skippedCount, "skipped");
}
