# Verani v2 Architecture Examples

This folder contains examples demonstrating the **new per-connection Durable Object architecture** that eliminates the global router anti-pattern.

## Architecture Overview

### Old Pattern (Deprecated)

```
Client A ─┐
Client B ─┼─► Single Global DO (handles ALL connections)
Client C ─┘    └─► sessions Map with ALL WebSockets
```

**Problems:**
- Single-threaded bottleneck
- O(n) broadcast operations
- Memory pressure from all connections in one DO
- No horizontal scalability

### New Pattern (Recommended)

```
Client A ─► ConnectionDO(userA) ─┐
                                 ├─► RoomDO("chat") ─► (membership + RPC fanout)
Client B ─► ConnectionDO(userB) ─┤
                                 │
Client C ─► ConnectionDO(userC) ─┴─► RoomDO("presence") ─► (membership + RPC fanout)
```

**Benefits:**
- Each user has their own DO (no bottleneck)
- Horizontal scalability
- Cost-efficient (idle DOs hibernate)
- Message delivery via efficient RPC
- Shared state in dedicated coordination DOs

## Files

| File | Description |
|------|-------------|
| `presence-connection.ts` | ConnectionDO for per-user presence WebSocket |
| `presence-room-coordinator.ts` | RoomDO for presence room coordination |

## Durable Object Topology

### 1. ConnectionDO (One Per User)

Each user gets their own ConnectionDO, identified by `userId`:

```typescript
// Worker routing
const userId = extractUserId(request);
const stub = UserConnection.get(userId);  // Deterministic routing
return stub.fetch(request);
```

The ConnectionDO:
- Owns exactly ONE WebSocket connection
- Stores minimal session metadata
- References rooms (not room data)
- Receives messages via RPC from RoomDOs

### 2. RoomDO (One Per Room/Channel)

Rooms are coordination DOs that manage membership:

```typescript
// ConnectionDO joins a room
await ctx.actor.joinRoom("presence", { username: "Alice" });

// ConnectionDO broadcasts to room
await ctx.emit.toRoom("presence").emit("chat:message", { text: "Hello!" });
```

The RoomDO:
- Manages member list (Set of userIds)
- Stores shared room state
- Broadcasts via RPC to member ConnectionDOs
- Does NOT hold WebSocket connections

## Message Flow

### User A sends message to room:

```
1. Client A sends WebSocket message
2. ConnectionDO(A) receives message
3. ConnectionDO(A) calls RoomDO.broadcast(event, data)
4. RoomDO iterates members, calls ConnectionDO(B).deliverMessage(...)
5. ConnectionDO(B) sends to its WebSocket
6. Client B receives message
```

### Direct message (A to B):

```
1. Client A sends { type: "dm", toUserId: "B", message: "Hi" }
2. ConnectionDO(A) receives message
3. ConnectionDO(A) calls ConnectionDO(B).deliverMessage(event, data)
4. ConnectionDO(B) sends to its WebSocket
5. Client B receives DM
```

## Wrangler Configuration

To use the new architecture, configure your `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "CONNECTION_DO"
class_name = "UserConnection"

[[durable_objects.bindings]]
name = "ROOM_DO"
class_name = "PresenceRoom"

[[migrations]]
tag = "v1"
new_classes = ["UserConnection", "PresenceRoom"]
```

## Usage Example

### Server (Connection Handler)

```typescript
import { defineConnection, createConnectionHandler } from "verani";

const myConnection = defineConnection({
  name: "MyConnection",
  websocketPath: "/ws",

  extractMeta(req) {
    const userId = extractUserIdFromRequest(req);
    return {
      userId,
      clientId: crypto.randomUUID(),
      channels: ["default"]
    };
  },

  async onConnect(ctx) {
    // Join a room
    await ctx.actor.joinRoom("lobby");
    
    // Send to this connection
    ctx.emit.emit("welcome", { userId: ctx.meta.userId });
  },

  async onDisconnect(ctx) {
    // Room leave is automatic
  }
});

// Register event handlers
myConnection.on("chat", async (ctx, data) => {
  // Broadcast to room
  await ctx.emit.toRoom("lobby").emit("chat:message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

myConnection.on("dm", async (ctx, data) => {
  // Direct message to user
  await ctx.emit.toUser(data.toUserId).emit("dm:received", {
    from: ctx.meta.userId,
    text: data.text
  });
});

export const UserConnection = createConnectionHandler(myConnection);
```

### Server (Room Coordinator)

```typescript
import { createRoomHandler } from "verani";

export const LobbyRoom = createRoomHandler({
  name: "LobbyRoom",

  async onJoin(roomState, userId, metadata) {
    console.log(`User ${userId} joined lobby`);
  },

  async onLeave(roomState, userId) {
    console.log(`User ${userId} left lobby`);
  }
});
```

### Worker Routing

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith("/ws")) {
      const userId = extractUserId(request);
      const stub = UserConnection.get(userId);
      return stub.fetch(request);
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

## Migration from v1

1. Replace `createActorHandler` with `createConnectionHandler`
2. Replace `defineRoom` with `defineConnection`
3. Create RoomDOs for shared state
4. Update Worker routing to use per-user DO IDs
5. Update event handlers to use async emit builders

### Before (v1)

```typescript
// All connections in one DO
const stub = MyActor.get("");  // Empty string = same DO for everyone
```

### After (v2)

```typescript
// Each user gets their own DO
const userId = extractUserId(request);
const stub = UserConnection.get(userId);  // User-specific DO
```
