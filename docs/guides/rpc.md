# RPC Guide

Remote Procedure Calls (RPC) for calling Actor methods from Workers or other Actors.

## RPC Considerations

When using RPC methods (calling Actor methods from Workers or other Actors), keep these points in mind:

### Actor ID Consistency

**Critical**: Use the same `idFromName()` value for WebSocket connections and RPC calls to the same Actor instance.

```typescript
// ✅ Correct: Same ID for WebSocket and RPC
const actorId = "chat-room-123";

// WebSocket connection
const id = env.CHAT.idFromName(actorId);
const stub = env.CHAT.get(id);
await stub.fetch(wsRequest);

// RPC call (must use same ID)
const id = env.CHAT.idFromName(actorId); // Same value!
const stub = env.CHAT.get(id);
await stub.sendToUser("alice", "default", data);
```

### Error Handling

RPC calls can fail due to network issues or Actor hibernation. Always wrap in try/catch:

```typescript
try {
  const sentCount = await stub.sendToUser(userId, "default", data);
  return Response.json({ success: true, sentTo: sentCount });
} catch (error) {
  console.error("RPC call failed:", error);
  // Actor might be hibernating - retry or return error
  return Response.json({
    success: false,
    error: "Failed to send message"
  }, { status: 503 });
}
```

### Performance

- RPC calls have network overhead compared to direct calls
- Batch operations when possible
- Consider caching actor state queries
- Use `Promise.all()` for parallel RPC calls

```typescript
// ✅ Good: Parallel RPC calls
const [count, userIds] = await Promise.all([
  stub.getSessionCount(),
  stub.getConnectedUserIds()
]);

// ❌ Bad: Sequential calls
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

## Common RPC Issues

### Issue: RPC calls failing with "Method not found"

**Solutions:**

1. Ensure you're using the stub, not the class directly:
```typescript
// ✅ Correct
const stub = env.CHAT.get(id);
await stub.sendToUser(...);

// ❌ Wrong
await ChatRoom.sendToUser(...);
```

2. Check that you're awaiting the Promise:
```typescript
// ✅ Correct
const count = await stub.getSessionCount();

// ❌ Wrong (forgot await)
const count = stub.getSessionCount();
```

3. Verify Actor ID matches between WebSocket and RPC calls

## Related Documentation

- [Server API - RPC Methods](../api/server.md#actorstub---rpc-methods) - Complete RPC API reference
- [Examples - RPC](../examples/rpc.md) - RPC usage examples
- [Concepts - RPC](../concepts/rpc.md) - RPC concepts and patterns

