# Isolation Strategy

Verani provides **three levels of isolation**.

## Level 1: Actor-Level Isolation

**Mechanism**: Different Actor instances (Durable Objects)

**Use case**: Completely separate groups of users

```typescript
// User A → Actor "user:alice"
// User B → Actor "user:bob"
// They never share state
```

## Level 2: Channel-Level Isolation

**Mechanism**: `meta.channels` array within same Actor

**Use case**: Sub-groups within the same logical room

```typescript
// Both in Actor "room:123"
// User A: channels = ["default", "admin"]
// User B: channels = ["default"]
// Admin messages only go to User A
```

## Level 3: User-Level Filtering

**Mechanism**: Send to specific user via emit API or broadcast filters

**Use case**: Direct messages within a room

```typescript
// Send to specific user using emit API (preferred)
ctx.emit.to("alice").emit("message", {
  text: "Hello Alice!",
  from: ctx.meta.userId
});

// Alternative: Broadcast with user filter (legacy API)
// ctx.actor.broadcast("default", data, {
//   userIds: ["alice"]
// });
```

## Related Documentation

- [Actors and Channels](./actors-channels.md) - Core concepts
- [Examples - Channels](../examples/channels.md) - Channel examples
- [Server API - broadcast](../api/server.md#broadcastchannel-string-data-any-options-number) - Broadcast API

