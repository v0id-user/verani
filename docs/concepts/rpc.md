# Remote Procedure Calls (RPC)

Calling Actor methods remotely from Workers or other Actors.

## Overview

Since Actors are Durable Objects, you can call their methods remotely from Workers or other Actors using RPC. This enables powerful patterns like sending notifications from HTTP endpoints or coordinating between multiple Actors.

## When to Use RPC vs Direct Methods

**Direct Methods** (inside lifecycle hooks):
- Use `ctx.actor.method()` directly
- Synchronous execution
- Full access to all methods
- Can pass WebSocket objects (e.g., `except: ctx.ws`)

**RPC Methods** (from Workers/other Actors):
- Use `stub.method()` via Actor stub
- Always returns `Promise<T>` (even if method is sync)
- Only methods with serializable return types
- Cannot pass WebSocket objects

## RPC Flow Diagram

```
+-------------------------------------------------------------+
|                   Cloudflare Worker                          |
|                                                              |
|  HTTP Request → Fetch Handler                                |
|                      |                                       |
|                      v                                       |
|              Get Actor Stub                                 |
|              ActorClass.get("id")                              |
|                      |                                       |
|                      v                                       |
|              RPC Call (stub.sendToUser(...))                |
|                      |                                       |
|                      v                                       |
|              Cloudflare RPC Layer                            |
|                      |                                       |
|                      v                                       |
+-------------------------------------------------------------+
|              Actor Instance (Durable Object)                |
|                      |                                       |
|                      v                                       |
|              Method Execution                               |
|              sendToUser()                                   |
|                      |                                       |
|                      v                                       |
|              Send to WebSocket(s)                           |
+-------------------------------------------------------------+
```

## RPC Example

**From a Worker HTTP endpoint:**

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// In your Worker fetch handler
if (url.pathname === "/api/notify") {
  const { userId, message } = await request.json();

  // Get Actor stub (simple - just pass the ID string)
  const stub = ChatRoom.get("chat-room");

  // Call via RPC - returns Promise
  const sentCount = await stub.sendToUser(userId, "default", {
    type: "notification",
    message
  });

  return Response.json({ sentTo: sentCount });
}
```

**From inside a lifecycle hook (direct call):**

```typescript
room.on("chat.message", (ctx, data) => {
  // Direct call - synchronous, full access to emit API
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });

  // Or use sendToUser for direct user messaging
  ctx.actor.sendToUser("alice", "default", {
    type: "message",
    text: data.text
  });

  // Legacy broadcast API with except option
  // ctx.actor.broadcast("default", data, { except: ctx.ws });
}
```

## Key RPC Concepts

1. **Actor Stub**: Obtained via `ActorHandlerClass.get(id)` - provides RPC interface
   - Export: `export const ChatRoom = createActorHandler(chatRoom);` (variable name must match wrangler.jsonc `class_name`)
   - Usage: `const stub = ChatRoom.get("room-id");`
2. **Promise Wrapping**: All RPC methods return Promises, even if underlying method is sync
3. **Serialization**: Only serializable types can be passed/returned over RPC
4. **Actor ID Consistency**: Use the same ID string for WebSocket connections and RPC calls to reach the same Actor instance
5. **Emit API Not Available**: The emit API (`ctx.emit`, `ctx.actor.emit`) is only available inside lifecycle hooks. RPC uses `broadcast()` and `sendToUser()` methods directly.

## RPC Limitations

- **No WebSocket in options**: `except` option not available in `RpcBroadcastOptions`
- **Limited methods**: Only methods with serializable return types are exposed
- **Network overhead**: RPC calls have latency compared to direct calls
- **Error handling**: RPC calls can fail - always wrap in try/catch

## Common RPC Patterns

**Send notifications from HTTP endpoints:**
```typescript
await stub.sendToUser(userId, "notifications", notificationData);
```

**Query actor state:**
```typescript
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

**Broadcast from external events:**
```typescript
// RPC uses broadcast() method (emit API not available over RPC)
await stub.broadcast("announcements", data, { userIds: ["admin"] });
```

**Coordinate between Actors:**
```typescript
// From Actor A, call Actor B
const otherStub = OtherRoom.get("other-room-id");
await otherStub.sendToUser(userId, "default", message);
```

## Related Documentation

- [RPC Guide](../guides/rpc.md) - Complete RPC guide
- [Server API - RPC Methods](../api/server.md#actorstub---rpc-methods) - RPC API reference
- [Examples - RPC](../examples/rpc.md) - RPC usage examples

