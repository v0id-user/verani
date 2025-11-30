# State Management

Verani distinguishes three types of state.

## 1. Connection Metadata (Survives Hibernation)

Stored in **WebSocket attachments** and **in-memory sessions**.

```typescript
interface ConnectionMeta {
  userId: string;
  clientId: string;
  channels: string[];
}
```

**Use case**: Who is connected, what channels they're in.

## 2. Ephemeral Actor State (Lost on Hibernation)

Stored only in memory, acceptable to lose.

```typescript
class MyActor extends Actor {
  presenceCount = 0; // Lost on hibernation, that's OK
}
```

**Use case**: Temporary counters, rate limits, cached computed values.

## 3. Handler Definitions (Survives Hibernation)

Event handlers registered via `room.on()` are stored statically at module scope, not in the Actor instance.

```typescript
const room = defineRoom({ /* ... */ });

// These handlers persist across hibernation automatically
room.on("chat.message", (ctx, data) => {
  // Handler logic
});
```

**Use case**: Event handlers, message routing, business logic.

**Important**: Handlers are automatically rebuilt when the Actor wakes from hibernation. You don't need to do anything - just define them statically in your code.

## 4. Durable State (Optional)

Stored in Durable Object storage or external database.

```typescript
// Use Durable Object storage
await ctx.actor.getStorage().put("lastMessage", message);
```

**Use case**: Chat history, persistent configuration, audit logs.

## Related Documentation

- [Hibernation](./hibernation.md) - How hibernation affects state and handlers
- [Server API - getStorage](../api/server.md#getstorage-durableobjectstorage) - Storage API
- [Examples - Presence](../examples/presence.md) - Example using durable storage

