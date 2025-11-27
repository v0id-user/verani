import type { ConnectionMeta } from "./types";

// Get the cloudflare actor's WebSocket attachment
export function storeAttachment(ws: WebSocket, meta: ConnectionMeta) {
  console.debug("[Verani:Attachment] Storing attachment:", { userId: meta.userId, clientId: meta.clientId, channels: meta.channels });
  ws.serializeAttachment(meta);
}

export function restoreSessions(actor: any) {
  console.debug("[Verani:Attachment] Restoring sessions from hibernation");
  let restoredCount = 0;
  for (const ws of actor.ctx.getWebSockets()) {
    const meta = ws.deserializeAttachment() as ConnectionMeta | undefined;
    if (!meta) {
      console.debug("[Verani:Attachment] WebSocket has no attachment, skipping");
      continue;
    }
    console.debug("[Verani:Attachment] Restored session:", { userId: meta.userId, clientId: meta.clientId });
    actor.sessions.set(ws, { ws, meta });
    restoredCount++;
  }
  console.debug("[Verani:Attachment] Restored", restoredCount, "sessions");
}
