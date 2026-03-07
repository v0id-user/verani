# Hibernation

Understanding how Cloudflare Actors hibernate and how Verani handles it.

## Hibernation = Sleep Mode for Actors

Cloudflare Actors **hibernate** when idle to save resources. This means:

1. **In-memory state is lost** (like Maps and objects)
2. **WebSocket connections stay alive** and can wake the Actor
3. **State needs to be restored** when the Actor wakes up
4. **The Actor instance is recreated** - it's a fresh instance every time

**Verani handles all of this automatically.** You don't need to worry about hibernation.

## Per-Connection Architecture (Recommended)

With the new per-connection architecture (`createConnectionHandler`), Verani automatically handles:

- **WebSocket restoration** - Connection metadata restored from attachments
- **Room membership persistence** - Rooms you've joined are saved and restored
- **Room metadata persistence** - Metadata passed to `joinRoom()` is preserved
- **Automatic room re-registration** - After wake, SDK re-joins all RoomDOs

```typescript
const connection = defineConnection({
  async onConnect(ctx) {
    // Join a room with metadata - this is automatically persisted
    await ctx.actor.joinRoom("presence", {
      username: ctx.meta.username,
      status: "online"
    });
  },

  // Optional: called after hibernation wake
  // Room re-joining is already handled by the SDK!
  async onHibernationRestore(actor) {
    console.log("Restored from hibernation");
    // Only use for custom post-wake logic
  }
});
```

**What the SDK handles automatically:**

1. Restores WebSocket connection from hibernation
2. Loads room membership from storage (with metadata)
3. Re-registers with each RoomDO via RPC
4. Calls your `onHibernationRestore` hook (optional)

## What Gets Lost vs What Persists

### Lost After Hibernation

- **In-memory Maps** (restored automatically by Verani)
- **Dynamic closures** created at runtime
- **Anonymous functions** stored in instance properties
- **Runtime-generated handlers** that depend on instance state
- **Any closure that captures `this`** or instance-specific state

### Persists Across Hibernation

- **WebSocket attachments** (metadata stored via `storeAttachment`)
- **Room membership** (in per-connection architecture)
- **Room join metadata** (in per-connection architecture)
- **Static handler definitions** registered via `.on()`
- **Room/Connection definition** (it's at module scope)
- **Persisted state** (via `state` + `persistedKeys`)
- **Durable Object storage** (if you use `getStorage()`)

## Event Handler Persistence

Event handlers registered via `connection.on()` **automatically persist** across hibernation because they're stored statically in the connection definition (at module scope), not in the Actor instance.

```typescript
const connection = defineConnection({
  name: "chat",
  websocketPath: "/ws"
});

// These handlers are stored statically and survive hibernation
connection.on("chat.message", (ctx, data) => {
  ctx.emit.toRoom("chat").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

connection.on("user.typing", (ctx, data) => {
  ctx.emit.toRoom("chat").emit("user.typing", {
    userId: ctx.meta.userId
  });
});
```

**How it works:**

1. Handlers are stored in `connection._staticHandlers` (at module scope)
2. When the Actor wakes from hibernation, handlers are rebuilt from static storage
3. Handlers work exactly as before - no code changes needed

**This is similar to Express/Elysia/Fastify routing** - routes are code-defined, not runtime-generated, so they survive restarts and hibernation.

### What NOT to Do

Don't create dynamic handlers that depend on instance state:

```typescript
// BAD: Handler closure captures instance state
class MyActor {
  constructor() {
    this.cache = new Map();
    // This will break after hibernation!
    this.handlers.set("event", (msg) => this.handleWithCache(msg));
  }

  handleWithCache(msg) {
    // this.cache won't exist after hibernation
    return this.cache.get(msg.id);
  }
}
```

Instead, use static handlers:

```typescript
// GOOD: Static handler definition
const connection = defineConnection({ /* ... */ });

connection.on("event", (ctx, data) => {
  // Handler is static - works after hibernation
  const storage = ctx.actor.getStorage();
  // Use storage for persistence, not instance state
});
```

## When Does Hibernation Occur?

Cloudflare Actors hibernate when:
- No requests have been received for a period of time
- No WebSocket messages have been sent/received
- The runtime decides to optimize resource usage

Sessions are automatically restored via WebSocket attachments, and event handlers are automatically rebuilt from static storage. Application state must be reconciled manually using the `onHibernationRestore` hook.

## Related Documentation

- [State Management](./state-management.md) - State types and persistence
- [Persistence](./persistence.md) - Declarative state persistence
- [Lifecycle](./lifecycle.md) - Connection lifecycle and hooks
- [Server API - onHibernationRestore](../api/server.md#onhibernationrestoreactor-veraniactor-void--promisevoid) - Hibernation hook
- [Examples - Presence](../examples/presence.md) - Example with hibernation handling

