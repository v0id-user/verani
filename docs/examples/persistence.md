# State Persistence Example

Demonstrates how to persist room state across Actor hibernation using Verani's declarative persistence API.

**Public** - No authentication required

## Overview

This example shows how to:
- Define state in your room definition
- Mark which keys to persist
- Access typed state in lifecycle hooks
- Automatically persist state changes

The counter value survives Actor hibernation - disconnect, wait for hibernation, reconnect, and your count is still there!

## Code Example

### Room Definition

```typescript
import { defineRoom, createActorHandler } from "verani";

export const counterRoom = defineRoom({
  name: "counter",
  websocketPath: "/ws/counter",

  // Define your room's state
  state: {
    count: 0,
    lastUpdatedBy: null as string | null,
  },

  // Only these keys are persisted to Durable Object storage
  persistedKeys: ["count", "lastUpdatedBy"],

  // Optional: Handle persistence errors
  onPersistError(key, error) {
    console.error(`Failed to persist "${key}":`, error.message);
  },

  onConnect(ctx) {
    // Send current count to new connections
    ctx.emit.emit("counter:sync", {
      count: ctx.actor.roomState.count,
      lastUpdatedBy: ctx.actor.roomState.lastUpdatedBy,
    });
  },
});

// Event: Increment the counter
counterRoom.on("counter:increment", (ctx, data) => {
  const amount = data?.amount ?? 1;

  // Modify state - automatically persisted!
  ctx.actor.roomState.count += amount;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  // Broadcast update to all clients
  ctx.actor.emit.to("default").emit("counter:update", {
    count: ctx.actor.roomState.count,
    updatedBy: ctx.meta.userId,
  });
});

// Event: Decrement the counter
counterRoom.on("counter:decrement", (ctx, data) => {
  const amount = data?.amount ?? 1;
  ctx.actor.roomState.count -= amount;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  ctx.actor.emit.to("default").emit("counter:update", {
    count: ctx.actor.roomState.count,
    updatedBy: ctx.meta.userId,
  });
});

// Event: Reset the counter
counterRoom.on("counter:reset", (ctx) => {
  ctx.actor.roomState.count = 0;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  ctx.actor.emit.to("default").emit("counter:reset", {
    resetBy: ctx.meta.userId,
  });
});

// Event: Get current count
counterRoom.on("counter:get", (ctx) => {
  ctx.emit.emit("counter:sync", {
    count: ctx.actor.roomState.count,
    lastUpdatedBy: ctx.actor.roomState.lastUpdatedBy,
  });
});

export const CounterActor = createActorHandler(counterRoom);
```

### Client Usage

```typescript
import { VeraniClient } from "verani/client";

const client = new VeraniClient("ws://localhost:8787/ws/counter");

// Listen for counter updates
client.on("counter:sync", (data) => {
  console.log(`Current count: ${data.count}`);
});

client.on("counter:update", (data) => {
  console.log(`Count updated to ${data.count}`);
});

// Wait for connection
await client.waitForConnection();

// Increment counter
client.emit("counter:increment", { amount: 1 });

// Decrement counter
client.emit("counter:decrement", { amount: 2 });

// Reset counter
client.emit("counter:reset", {});

// Get current count
client.emit("counter:get", {});
```

## Key Concepts

### State Definition

Define your state with initial values:

```typescript
state: {
  count: 0,
  lastUpdatedBy: null as string | null,
}
```

### Persisted Keys

Only specified keys are persisted:

```typescript
persistedKeys: ["count", "lastUpdatedBy"]
```

Keys not in this array are ephemeral (reset on hibernation wake).

### Typed State Access

State is fully typed based on your definition:

```typescript
// Typed as number
ctx.actor.roomState.count += 1;

// Typed as string | null
ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

// Type error - property doesn't exist
ctx.actor.roomState.foo;
```

### Automatic Persistence

Changes to persisted keys are automatically saved:

```typescript
ctx.actor.roomState.count += 1;  // Automatically persisted!
```

No manual `getStorage().put()` calls needed.

## Testing Persistence

1. **Start the server**: `wrangler dev`
2. **Run the client**: `bun run examples/persistence/counter-client.ts`
3. **Increment the counter** a few times
4. **Disconnect** the client
5. **Wait** for Actor hibernation (or restart server)
6. **Reconnect** - your count is still there!

## Persistence Options

Customize persistence behavior:

```typescript
persistOptions: {
  // Only track top-level changes (default: true)
  shallow: true,
  
  // Throw errors on persistence failures (default: true)
  throwOnError: false
}
```

## Error Handling

Handle persistence failures gracefully:

```typescript
onPersistError(key, error) {
  console.error(`Failed to persist ${key}:`, error);
  // Maybe notify admins, fallback to cache, etc.
}
```

## What Gets Persisted?

- Values in `persistedKeys` array
- Primitives (string, number, boolean, null)
- Objects and arrays
- Special types: Date, Map, Set, RegExp

## What Doesn't Get Persisted?

- Keys not in `persistedKeys` array
- Functions
- Symbols
- Circular references (detected and warned)

## Related Documentation

- [Persistence Concepts](../concepts/persistence.md) - Deep dive into persistence
- [State Management](../concepts/state-management.md) - State types overview
- [Hibernation](../concepts/hibernation.md) - How hibernation works
- [Server API - State Persistence](../api/server.md#state-persistence) - API reference
