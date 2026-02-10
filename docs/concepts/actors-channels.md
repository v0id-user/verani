# Actors and Channels

The three core concepts of Verani.

In the **per-connection architecture** (recommended), these map directly to concrete types:

- **ConnectionDO** → created with `createConnectionHandler()`; owns a single WebSocket per user.
- **RoomDO** → created with `createRoomHandler()`; owns no sockets, only room membership + coordination.

See the [Quick Start](../getting-started/quick-start.md) for a minimal example using `UserConnection` (ConnectionDO) and `ChatRoom` (RoomDO).

## 1. Actors = Isolated Realtime Containers

Think of each Actor instance as a **self-contained realtime room**.

```
+---------------------------------------+
| Actor Instance (Durable Object)       |
|                                       |
|   [WebSocket]  [WebSocket]  [WebSocket]
|    User A       User B       User C   |
|                                       |
|   Memory: Sessions Map                |
|   Hibernation: Attachments            |
+---------------------------------------+
```

**Key insight**: You control isolation by how you route requests to Actors.

- **Chat room**: Route by room ID → everyone in room shares Actor
- **User feed**: Route by user ID → each user gets their own Actor
- **Game session**: Route by game ID → players in same game share Actor

## 2. Channels = Sub-rooms Within an Actor

Inside a single Actor, connections can subscribe to different **channels** for selective message delivery.

```
Actor: "game-room-123"
|
+-- Channel: "default"
|   +-- User A
|   +-- User B
|   +-- User C
|
+-- Channel: "game-state"
|   +-- User A
|   +-- User B
|
+-- Channel: "chat"
    +-- User C
```

When you broadcast to a channel, only connections subscribed to that channel receive the message:

```typescript
// Only users in "game-state" channel receive this (using emit API)
ctx.actor.emit.to("game-state").emit("score", { score: 100 });

// Alternative: Legacy broadcast API (still supported)
// ctx.actor.broadcast("game-state", { score: 100 });
```

**Default behavior**: Every connection starts in the `["default"]` channel.

## Summary

Remember these mental models:

1. **ConnectionDO = Per-user Actor**: Created via `createConnectionHandler()`, owns one WebSocket and per-user state, joins rooms and emits events.
2. **RoomDO = Coordinator Actor**: Created via `createRoomHandler()`, tracks which users are in each room and fans out messages to their ConnectionDOs via RPC.
3. **Channels = Sub-rooms**: Filter messages within an Actor (for example, per-topic channels inside a room).
4. **Attachments = Hibernation Survival**: WebSocket metadata persists across hibernation.

Everything else follows from these principles.

## Related Documentation

- [Quick Start](../getting-started/quick-start.md) - End-to-end example using `UserConnection` and `ChatRoom`
- [Server API](../api/server.md) - Full API documentation for `createConnectionHandler()` and `createRoomHandler()`
- [Architecture](./architecture.md) - System architecture
- [Hibernation](./hibernation.md) - Hibernation behavior
- [Isolation](./isolation.md) - Isolation strategies
- [Examples - Channels](../examples/channels.md) - Channel examples

