# Troubleshooting

Common issues and solutions when working with Verani.

## WebSocket not connecting

1. Check your Worker URL is correct
2. Use `wss://` not `ws://` for production
3. Check browser console for errors
4. Verify your Durable Object binding is correct in `wrangler.jsonc`
5. Ensure the export name matches `class_name` in wrangler config

## Messages not reaching clients

1. Check you're broadcasting to the right channel
2. Verify clients are subscribed to that channel
3. Check server logs with `npx wrangler tail`
4. Use browser DevTools → Network → WS to inspect WebSocket frames
5. Ensure the Actor instance ID matches (same `idFromName()` value)

## RPC calls not working

1. **"Method not found"**: Ensure you're using the stub from `ChatRoom.get(id)`, not calling methods directly on the class
2. **"Promise not awaited"**: RPC methods always return Promises - use `await`
3. **"Cannot serialize"**: Don't pass WebSocket objects or DurableObjectStorage in RPC calls
4. **"Actor not found"**: Ensure the Actor ID matches what you used for WebSocket connections

```typescript
// ✅ Correct: Get stub using class's static get() method
const stub = ChatRoom.get("chat-room");
await stub.sendToUser("alice", "default", data);

// ❌ Wrong: Can't call methods directly on the class
await ChatRoom.sendToUser(...); // This won't work! Use stub instead.
```

## Reconnection not working

The client automatically reconnects on connection loss. To customize:

```typescript
const client = new VeraniClient(url, {
  reconnection: {
    enabled: true,
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5
  }
});
```

## Connection keepalive and tab visibility

Verani automatically manages connection keepalive using ping/pong messages. The client includes built-in support for the Page Visibility API, which automatically resyncs ping intervals when browser tabs become active again. This prevents connection issues after tab inactivity.

To customize keepalive behavior:

```typescript
const client = new VeraniClient(url, {
  pingInterval: 5000,  // Send ping every 5 seconds (default)
  pongTimeout: 5000,   // Expect pong within 5 seconds (default)
  // Set pingInterval to 0 to disable keepalive
});
```

**Note:** The Page Visibility API integration is environment-aware and only activates in browser environments. It gracefully handles Node.js and SSR environments without errors.

## Quick Reference

### Common Patterns

**Send message to user from lifecycle hook:**
```typescript
ctx.actor.sendToUser("alice", "default", { type: "message", text: "Hello" });
```

**Send message to user via RPC (from Worker):**
```typescript
const stub = ChatRoom.get("chat-room");
await stub.sendToUser("alice", "default", { type: "message", text: "Hello" });
```

**Broadcast to channel:**
```typescript
// Inside lifecycle hook - can use except option
ctx.actor.broadcast("default", data, { except: ctx.ws });

// Via RPC - use RpcBroadcastOptions (no except option)
await stub.broadcast("default", data, { userIds: ["alice", "bob"] });
```

**Get actor state:**
```typescript
// Inside lifecycle hook
const count = ctx.actor.getSessionCount();
const userIds = ctx.actor.getConnectedUserIds();

// Via RPC
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

**Access persisted state:**
```typescript
// Inside lifecycle hook - fully typed!
const messageCount = ctx.actor.roomState.messageCount;
ctx.actor.roomState.messageCount++; // Automatically persisted

// Check if state is ready
if (ctx.actor.isStateReady()) {
  // Safe to access roomState
}
```

### Key Differences: Direct vs RPC

| Feature | Direct (`ctx.actor`) | RPC (`stub`) |
|---------|---------------------|--------------|
| **Where** | Inside lifecycle hooks | From Workers/other Actors |
| **Returns** | Synchronous value | Always `Promise<T>` |
| **Broadcast options** | `BroadcastOptions` (includes `except`) | `RpcBroadcastOptions` (no `except`) |
| **Available methods** | All methods | Only serializable return types |

## Persistence Issues

### State not persisting

1. **Check `persistedKeys`**: Only keys in this array are persisted
2. **Verify state is defined**: Ensure `state` is defined in your room definition
3. **Check for errors**: Use `onPersistError` hook to catch persistence failures
4. **Wait for initialization**: State is loaded during `onInit` - use `isStateReady()` if needed

```typescript
const room = defineRoom({
  state: { count: 0 },
  persistedKeys: ["count"], // Must include the key!
  
  onPersistError(key, error) {
    console.error(`Failed to persist ${key}:`, error);
  },
  
  onConnect(ctx) {
    // State is ready by the time onConnect is called
    ctx.actor.roomState.count++; // Automatically persisted
  }
});
```

### State type errors

State is fully typed based on your definition:

```typescript
// ✅ Correct: Typed based on state definition
ctx.actor.roomState.count; // number
ctx.actor.roomState.settings; // { maxUsers: number }

// ❌ Error: Property doesn't exist
ctx.actor.roomState.foo; // TypeScript error
```

### State accessed before initialization

State is loaded asynchronously during `onInit`. In practice, it's always ready by the time `onConnect` is called, but you can check:

```typescript
onConnect(ctx) {
  if (ctx.actor.isStateReady()) {
    // Safe to access roomState
    console.log(ctx.actor.roomState.count);
  }
}
```

## Related Documentation

- [Quick Start Guide](./quick-start.md) - Step-by-step tutorial
- [Persistence Concepts](../concepts/persistence.md) - State persistence guide
- [API Reference](../api/server.md) - Complete API documentation
- [RPC Guide](../guides/rpc.md) - Remote Procedure Calls
- [Configuration Guide](../guides/configuration.md) - Wrangler configuration

