# Configuration Guide

How to configure Verani for Cloudflare Workers.

## The Three-Way Match

These three must match:

1. **Export name** in `src/index.ts`: `export const ChatRoom = ...`
2. **Class name** in `wrangler.jsonc`: `"class_name": "ChatRoom"`
3. **Migration** in `wrangler.jsonc`: `"new_sqlite_classes": ["ChatRoom"]`

## Basic Setup

### 1. Export Your Actor Class

```typescript
// src/index.ts
import { createActorHandler } from "verani";
import { chatRoom } from "./actors/chat.actor";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };
```

### 2. Configure Wrangler

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  
  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // Must match export name
        "name": "CHAT"
      }
    ]
  },
  
  "migrations": [
    {
      "new_sqlite_classes": ["ChatRoom"],  // Must match export name
      "tag": "v1"
    }
  ]
}
```

### 3. Route WebSocket Connections

```typescript
// src/index.ts
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith("/ws")) {
      const stub = ChatRoom.get("chat-room");
      return stub.fetch(request);
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

## Multiple Rooms

```typescript
// src/index.ts
export const ChatRoom = createActorHandler(chatRoom);
export const PresenceRoom = createActorHandler(presenceRoom);
```

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "class_name": "ChatRoom", "name": "CHAT" },
      { "class_name": "PresenceRoom", "name": "PRESENCE" }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["ChatRoom", "PresenceRoom"],
      "tag": "v1"
    }
  ]
}
```

## Actor Routing

Choose which Actor instance handles requests by picking the Actor ID:

```typescript
// Single room (all users share one Actor)
ChatRoom.get("global-chat");

// Room-based (each room gets its own Actor)
const roomId = url.searchParams.get("roomId");
ChatRoom.get(`room:${roomId}`);

// User-based (each user gets their own Actor)
const userId = url.searchParams.get("userId");
ChatRoom.get(`user:${userId}`);
```

**Important**: Use the same Actor ID for WebSocket connections and RPC calls.

## Common Errors

**"no such Durable Object class is exported"**
- Fix: Export name doesn't match `class_name` in wrangler.jsonc

**"Cannot find name 'ChatRoom'"**
- Fix: Missing export: `export { ChatRoom };`

**"Generic type 'Actor<E>' requires 1 type argument"**
- Fix: Use `createActorHandler()` correctly

## Related

- [Quick Start](../getting-started/quick-start.md)
- [Deployment](./deployment.md)
- [RPC Guide](./rpc.md)
