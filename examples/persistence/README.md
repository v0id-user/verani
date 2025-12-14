# Persistent Counter Example

A simple example demonstrating **state persistence** in Verani.

The counter value survives Actor hibernation - stop the server, wait for hibernation, restart, and your count is still there!

## How It Works

```typescript
const counterRoom = defineRoom({
  // Define state with initial values
  state: {
    count: 0,
    lastUpdatedBy: null as string | null,
  },

  // Only these keys are persisted to Durable Object storage
  persistedKeys: ["count", "lastUpdatedBy"],

  onConnect(ctx) {
    // Access state via ctx.actor.roomState
    ctx.emit.emit("counter:sync", {
      count: ctx.actor.roomState.count,
    });
  },
});

counterRoom.on("counter:increment", (ctx, data) => {
  // Modify state - automatically persisted!
  ctx.actor.roomState.count += 1;
});
```

## Running the Example

### 1. Start the Server

```bash
# From the verani root directory
bun run dev
```

### 2. Run the Client

```bash
bun run examples/persistence/counter-client.ts
```

### 3. Try It Out

```
Persistent Counter Client
============================

Connected!
Current count: 0

Commands:
  +       Increment by 1
  -       Decrement by 1
  +N      Increment by N (e.g., +5)
  -N      Decrement by N (e.g., -3)
  r       Reset to 0
  g       Get current count
  q       Quit

> +
✨ Count updated to 1 by user-abc123

> +5
✨ Count updated to 6 by user-abc123

> -
✨ Count updated to 5 by user-abc123

> q
Goodbye!
```

## Testing Persistence

1. Increment the counter a few times
2. Disconnect the client (`q`)
3. Wait a moment (or restart the server)
4. Reconnect - your count should still be there!

## Key Concepts

| Concept | Description |
|---------|-------------|
| `state` | Define initial state values in your room definition |
| `persistedKeys` | Array of keys to persist (others are ephemeral) |
| `roomState` | Access state via `ctx.actor.roomState` |
| Auto-persist | Changes to persisted keys are saved automatically |

## Files

- `counter-room.ts` - Room definition with persistence
- `counter-client.ts` - Interactive CLI client

## Related Docs

- [Persistence Concepts](../../docs/concepts/persistence.md)
- [State Management](../../docs/concepts/state-management.md)
- [Hibernation](../../docs/concepts/hibernation.md)
