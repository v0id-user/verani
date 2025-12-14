# Troubleshooting

Common issues and quick fixes.

## WebSocket Not Connecting

1. Check Worker URL is correct
2. Use `wss://` (not `ws://`) for production
3. Verify export name matches `class_name` in `wrangler.jsonc`
4. Check browser console for errors

## Messages Not Reaching Clients

1. Check you're broadcasting to the right channel
2. Verify clients are subscribed to that channel
3. Check server logs: `npx wrangler tail`
4. Ensure Actor ID matches (same `ChatRoom.get("id")` value)

## RPC Calls Not Working

**"Method not found"**
```typescript
// Correct
const stub = ChatRoom.get("room-id");
await stub.sendToUser("alice", "default", data);

// Wrong - can't call directly on class
await ChatRoom.sendToUser(...);
```

**"Promise not awaited"**
- RPC methods always return Promises - use `await`

**"Cannot serialize"**
- Don't pass WebSocket objects or DurableObjectStorage in RPC calls

## Reconnection Issues

Client automatically reconnects. To customize:

```typescript
const client = new VeraniClient(url, {
  reconnection: {
    enabled: true,
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000
  }
});
```

## Keepalive

Verani handles ping/pong automatically. To customize:

```typescript
const client = new VeraniClient(url, {
  pingInterval: 5000,  // Default: 5 seconds
  pongTimeout: 5000,   // Default: 5 seconds
  // Set pingInterval to 0 to disable
});
```

## State Not Persisting

1. Check `persistedKeys` includes the key you want to persist
2. Verify `state` is defined in your room definition
3. Use `onPersistError` hook to catch errors

```typescript
const room = defineRoom({
  state: { count: 0 },
  persistedKeys: ["count"], // Must include!
  
  onPersistError(key, error) {
    console.error(`Failed to persist ${key}:`, error);
  }
});
```

## Quick Reference

**Send message (inside lifecycle hook):**
```typescript
ctx.actor.sendToUser("alice", "default", { type: "message", text: "Hello" });
```

**Send message via RPC (from Worker):**
```typescript
const stub = ChatRoom.get("chat-room");
await stub.sendToUser("alice", "default", { type: "message", text: "Hello" });
```

**Broadcast to channel:**
```typescript
// Inside hook - can use except option
ctx.actor.broadcast("default", data, { except: ctx.ws });

// Via RPC - no except option
await stub.broadcast("default", data, { userIds: ["alice"] });
```

**Get actor state:**
```typescript
// Inside hook
const count = ctx.actor.getSessionCount();

// Via RPC
const count = await stub.getSessionCount();
```

## Direct vs RPC

| Feature | Direct (`ctx.actor`) | RPC (`stub`) |
|---------|---------------------|--------------|
| **Where** | Inside lifecycle hooks | From Workers/other Actors |
| **Returns** | Synchronous value | Always `Promise<T>` |
| **Broadcast options** | `BroadcastOptions` (includes `except`) | `RpcBroadcastOptions` (no `except`) |

## Related

- [Quick Start](./quick-start.md)
- [Configuration Guide](../guides/configuration.md)
- [API Reference](../api/server.md)
