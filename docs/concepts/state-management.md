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

## 4. Persisted Room State (Survives Hibernation)

Declared in your room definition and automatically persisted to Durable Object storage.

```typescript
const room = defineRoom({
  state: {
    messageCount: 0,
    settings: { maxUsers: 100 }
  },
  persistedKeys: ["messageCount", "settings"],
  
  onConnect(ctx) {
    ctx.actor.roomState.messageCount++;
    // Automatically persisted!
  }
});
```

**Use case**: Counters, settings, game state, anything that should survive hibernation.

**See**: [Persistence](./persistence.md) for full documentation.

## 5. Manual Durable Storage (Full Control)

For advanced use cases, access Durable Object storage directly.

```typescript
// Manual storage access
await ctx.actor.getStorage().put("lastMessage", message);
const msg = await ctx.actor.getStorage().get("lastMessage");
```

**Use case**: Chat history, audit logs, large datasets, custom serialization.

## Quick Reference

| State Type | Survives Hibernation | Access |
|------------|---------------------|--------|
| Connection Metadata | Yes | `ctx.meta` |
| Ephemeral Actor State | No | Class properties |
| Handler Definitions | Yes | `room.on()` |
| Persisted Room State | Yes | `ctx.actor.roomState` |
| Manual Durable Storage | Yes | `ctx.actor.getStorage()` |

## Related Documentation

- [Persistence](./persistence.md) - Declarative state persistence
- [Hibernation](./hibernation.md) - How hibernation affects state and handlers
- [Server API - getStorage](../api/server.md#getstorage-durableobjectstorage) - Storage API
- [Examples - Presence](../examples/presence.md) - Example using durable storage

