# State Persistence

Automatically persist room state to Durable Object storage with safe, predictable behavior.

## The Problem

Cloudflare Actors hibernate when idle. When they wake up:

- In-memory state is **lost**
- WebSocket connections survive (Verani restores these automatically)
- But your custom room state (counters, settings, game state) is **gone**

You could manually use `getStorage().put()` and `getStorage().get()`, but this is tedious and error-prone.

## The Solution: Declarative State Persistence

Define your state once, mark which keys to persist, and Verani handles the rest:

```typescript
const gameRoom = defineRoom({
  websocketPath: "/ws/game",
  
  // Define your room's state
  state: {
    messageCount: 0,
    lastActivity: null as Date | null,
    settings: { maxPlayers: 10, roundTime: 60 }
  },
  
  // Only these keys are persisted to storage
  persistedKeys: ["messageCount", "settings"],
  
  onConnect(ctx) {
    // Access state via ctx.actor.roomState
    ctx.actor.roomState.messageCount++;
    // ↑ Automatically persisted!
  }
});
```

## How It Works

1. **On Actor Init**: State is loaded from Durable Object storage
2. **On State Change**: Modified keys are automatically saved
3. **On Hibernation Wake**: State is restored seamlessly

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Define State   │────▶│  Actor Starts    │────▶│  Load from DO   │
│  in RoomDef     │     │  (onInit)        │     │  Storage        │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              ▼
                        │  Proxy Tracks    │◀────┬───────────────────┐
                        │  Changes         │     │  roomState ready  │
                        └────────┬─────────┘     └───────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Auto-persist    │
                        │  to DO Storage   │
                        └──────────────────┘
```

## Configuration Options

### `state`

Initial values for your room state. These are the defaults when no persisted data exists.

```typescript
state: {
  counter: 0,
  users: [] as string[],
  config: { theme: "dark" }
}
```

### `persistedKeys`

Which keys from `state` to persist. Only these keys are saved to storage.

```typescript
// Only 'counter' and 'config' survive hibernation
// 'users' is ephemeral (reset on wake)
persistedKeys: ["counter", "config"]
```

**Tip**: Don't persist frequently-changing data like typing indicators or cursor positions. Persist meaningful state like message counts, settings, or game scores.

### `persistOptions`

Fine-tune persistence behavior:

```typescript
persistOptions: {
  // Only track top-level property changes (default: true)
  // Set to false for deep change tracking (nested objects)
  shallow: true,
  
  // Throw errors on persistence failures (default: true)
  // Set to false to silently continue on errors
  throwOnError: true
}
```

### `onPersistError`

Handle persistence failures gracefully:

```typescript
onPersistError(key, error) {
  console.error(`Failed to persist ${key}:`, error);
  // Maybe notify admins, fallback to cache, etc.
}
```

## Accessing State

State is available via `ctx.actor.roomState` in all lifecycle hooks:

```typescript
const room = defineRoom({
  state: { score: 0 },
  persistedKeys: ["score"],
  
  onConnect(ctx) {
    console.log("Current score:", ctx.actor.roomState.score);
  },
  
  onMessage(ctx, frame) {
    if (frame.data.type === "score") {
      ctx.actor.roomState.score += frame.data.points;
      // Automatically persisted!
    }
  }
});

room.on("game.point", (ctx, data) => {
  ctx.actor.roomState.score += data.points;
  ctx.emit.to("default").emit("score.update", {
    score: ctx.actor.roomState.score
  });
});
```

## Checking State Readiness

State is loaded asynchronously during `onInit`. Use `isStateReady()` if you need to check:

```typescript
onConnect(ctx) {
  if (ctx.actor.isStateReady()) {
    // Safe to access roomState
    console.log(ctx.actor.roomState.counter);
  }
}
```

In practice, state is always ready by the time `onConnect` is called, but this is useful for defensive programming.

## Safety Features

Verani's persistence is designed to be **safe and predictable**, addressing issues in other implementations:

| Issue | Other Implementations | Verani |
|-------|----------------------|--------|
| Deep proxy magic | Auto-creates nested objects unexpectedly | Shallow tracking by default |
| Object mutation | Merges objects instead of replacing | Replaces values predictably |
| Silent failures | Swallows errors, returns empty objects | Throws `PersistError` with context |
| Race conditions | Can access state before init | Clear error if accessed too early |
| Circular refs | Can crash or hang | Detected and warned |

## Serialization

Values are JSON-serialized with special handling for:

- **Date** → Restored as Date objects
- **Map** → Restored as Map objects  
- **Set** → Restored as Set objects
- **RegExp** → Restored as RegExp objects
- **Circular references** → Detected and skipped with warning

```typescript
state: {
  createdAt: new Date(),           // Works
  userSet: new Set<string>(),      // Works
  config: new Map([["key", "val"]]) // Works
}
```

**Not supported**: Functions, Symbols, WeakMap, WeakSet, or custom class instances.

## Full Example: Persistent Counter Room

```typescript
import { defineRoom, createActorHandler } from "verani";

const counterRoom = defineRoom({
  name: "counter",
  websocketPath: "/ws/counter",
  
  state: {
    count: 0,
    lastUpdatedBy: null as string | null,
    history: [] as Array<{ userId: string; delta: number; timestamp: number }>
  },
  
  // Only persist count and lastUpdatedBy, not full history
  persistedKeys: ["count", "lastUpdatedBy"],
  
  persistOptions: {
    shallow: true,
    throwOnError: false // Don't crash on persist errors
  },
  
  onPersistError(key, error) {
    console.error(`[Counter] Persist failed for ${key}:`, error);
  },
  
  onConnect(ctx) {
    // Send current count to new connections
    ctx.emit.emit("counter.sync", {
      count: ctx.actor.roomState.count,
      lastUpdatedBy: ctx.actor.roomState.lastUpdatedBy
    });
  }
});

counterRoom.on("counter.increment", (ctx, data) => {
  const delta = data.amount ?? 1;
  ctx.actor.roomState.count += delta;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;
  
  // Broadcast to all clients
  ctx.actor.emit.to("default").emit("counter.update", {
    count: ctx.actor.roomState.count,
    updatedBy: ctx.meta.userId
  });
});

counterRoom.on("counter.reset", (ctx) => {
  ctx.actor.roomState.count = 0;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;
  
  ctx.actor.emit.to("default").emit("counter.reset", {
    resetBy: ctx.meta.userId
  });
});

export const CounterActor = createActorHandler(counterRoom);
```

## Related Documentation

- [Server API - State Persistence](../api/server.md#state-persistence)
- [State Management](./state-management.md) - Overview of state types
- [Hibernation](./hibernation.md) - How hibernation affects state
- [Lifecycle](./lifecycle.md) - When hooks are called
