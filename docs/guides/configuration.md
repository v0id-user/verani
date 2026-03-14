# Configuration Guide

How to configure Verani for Cloudflare Workers.

## The Three-Way Match

These three must match for every Durable Object:

1. **Export name** in `src/index.ts`: `export const UserConnection = ...`
2. **Class name** in `wrangler.jsonc`: `"class_name": "UserConnection"`
3. **Migration** in `wrangler.jsonc`: `"new_sqlite_classes": ["UserConnection"]`

## Basic Setup

Verani uses a per-connection architecture: each user gets their own **ConnectionDO**, and separate **RoomDOs** handle coordination. Both need explicit binding configuration.

### 1. Define Your Connection

```typescript
// src/actors/connection.ts
import { defineConnection } from "verani";

const connection = defineConnection({
  name: "UserConnection",
  websocketPath: "/ws",

  // Map logical room names → wrangler.jsonc binding names
  rooms: {
    chat: "ChatRoom",
  },

  // Binding name for this connection DO (must match wrangler.jsonc)
  connectionBinding: "UserConnection",

  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") ?? crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      channels: ["default"],
    };
  },

  async onConnect(ctx) {
    await ctx.actor.joinRoom("chat");
    ctx.emit("welcome", { message: "Connected!" });
  },
});
```

### 2. Export Handlers

```typescript
// src/index.ts
import { createConnectionHandler, createRoomHandler } from "verani";
import { connection } from "./actors/connection";

export const UserConnection = createConnectionHandler(connection);

export const ChatRoom = createRoomHandler({
  name: "ChatRoom",
  connectionBinding: "UserConnection",
});
```

### 3. Configure Wrangler

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  "durable_objects": {
    "bindings": [
      { "class_name": "UserConnection", "name": "UserConnection" },
      { "class_name": "ChatRoom", "name": "ChatRoom" }
    ]
  },

  "migrations": [
    {
      "new_sqlite_classes": ["UserConnection", "ChatRoom"],
      "tag": "v1"
    }
  ]
}
```

### 4. Route WebSocket Connections

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws")) {
      const userId = url.searchParams.get("userId") ?? crypto.randomUUID();
      const id = env.UserConnection.idFromName(userId);
      const stub = env.UserConnection.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

## Binding Configuration

Verani requires explicit binding names so ConnectionDOs and RoomDOs can find each other via RPC.

### `rooms` (ConnectionDefinition)

Maps logical room names to wrangler.jsonc binding names:

```typescript
defineConnection({
  rooms: {
    presence: "PresenceRoom",  // "presence" → env.PresenceRoom
    chat: "ChatRoom",         // "chat" → env.ChatRoom
  },
});
```

When you call `ctx.actor.joinRoom("presence")`, Verani looks up `"PresenceRoom"` from this map and uses `env.PresenceRoom` to reach the RoomDO.

### `connectionBinding` (both Connection and Room)

Tells DOs how to find the ConnectionDO binding:

```typescript
// Connection side
defineConnection({ connectionBinding: "UserConnection" });

// Room side — needed so RoomDOs can deliver messages back to connections
createRoomHandler({ connectionBinding: "UserConnection" });
```

## Multiple Rooms

```typescript
// src/index.ts
export const UserConnection = createConnectionHandler(connection);
export const ChatRoom = createRoomHandler({
  name: "ChatRoom",
  connectionBinding: "UserConnection",
});
export const PresenceRoom = createRoomHandler({
  name: "PresenceRoom",
  connectionBinding: "UserConnection",
});
```

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "class_name": "UserConnection", "name": "UserConnection" },
      { "class_name": "ChatRoom", "name": "ChatRoom" },
      { "class_name": "PresenceRoom", "name": "PresenceRoom" }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["UserConnection", "ChatRoom", "PresenceRoom"],
      "tag": "v1"
    }
  ]
}
```

## Actor Routing

Choose which Actor instance handles requests by picking the Actor ID:

```typescript
// Per-user (recommended — each user gets their own ConnectionDO)
const id = env.UserConnection.idFromName(userId);
env.UserConnection.get(id);

// Room-based (each room gets its own RoomDO)
const id = env.ChatRoom.idFromName(`room:${roomId}`);
env.ChatRoom.get(id);
```

## Common Errors

**"no such Durable Object class is exported"**
- Fix: Export name doesn't match `class_name` in wrangler.jsonc

**"Cannot find name 'UserConnection'"**
- Fix: Missing export: `export { UserConnection };`

**"RoomDO binding not found"**
- Fix: `rooms` map in `defineConnection` doesn't include the room name, or the binding name doesn't match wrangler.jsonc

**"Connection binding not found"**
- Fix: `connectionBinding` doesn't match the binding name in wrangler.jsonc

## Related

- [Quick Start](../getting-started/quick-start.md)
- [Deployment](./deployment.md)
- [RPC Guide](./rpc.md)
