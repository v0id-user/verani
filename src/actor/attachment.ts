import type { ConnectionMeta } from "./types";

// Get the cloudflare actor's WebSocket attachment
export function storeAttachment(ws: WebSocket, meta: ConnectionMeta) {
  ws.serializeAttachment(meta);
}

export function restoreSessions(actor: any) {
  for (const ws of actor.ctx.getWebSockets()) {
    const meta = ws.deserializeAttachment() as ConnectionMeta | undefined;
    if (!meta) continue;
    actor.sessions.set(ws, { ws, meta });
  }
}
