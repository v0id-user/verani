# RPC Guide

Remote Procedure Calls (RPC) for calling Actor methods from Workers or other Actors.

## RPC Considerations

When using RPC methods (calling Actor methods from Workers or other Actors), keep these points in mind:

### Actor ID Consistency

**Critical**: Use the same ID string for WebSocket connections and RPC calls to reach the same Actor instance.

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// ✅ Correct: Same ID for WebSocket and RPC
const actorId = "chat-room-123";

// WebSocket connection
const stub = ChatRoom.get(actorId);
await stub.fetch(wsRequest);

// RPC call (must use same ID) - Socket.IO-like API
const stub = ChatRoom.get(actorId); // Same value!
await stub.emitToUser("alice", "message", data);
```

### Error Handling

RPC calls can fail due to network issues or Actor hibernation. Always wrap in try/catch:

```typescript
try {
  // Socket.IO-like API - direct method call
  const sentCount = await stub.emitToUser(userId, "message", data);
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

## Migrating from Legacy API to Socket.IO-like API

Verani now provides a Socket.IO-like emit API for RPC calls, offering a unified and familiar developer experience. The legacy methods (`sendToUser`, `broadcast`) are still available but deprecated.

### Migration Examples

**Sending to a user:**

```typescript
// Legacy API (deprecated)
const sentCount = await stub.sendToUser(userId, "default", {
  type: "notification",
  message: "Hello"
});

// New Socket.IO-like API (recommended) - direct method call
const sentCount = await stub.emitToUser(userId, "notification", {
  message: "Hello"
});
```

**Broadcasting to a channel:**

```typescript
// Legacy API (deprecated)
await stub.broadcast("announcements", {
  type: "update",
  text: "Server maintenance"
});

// New Socket.IO-like API (recommended) - direct method call
await stub.emitToChannel("announcements", "update", {
  text: "Server maintenance"
});
```

**Emitting to default channel:**

```typescript
// Legacy API (deprecated)
await stub.broadcast("default", {
  type: "announcement",
  message: "Hello everyone"
});

// New Socket.IO-like API (recommended) - direct method call
await stub.emitToChannel("default", "announcement", {
  message: "Hello everyone"
});
```

### When to Use Legacy API

The legacy API is still needed when you require advanced filtering options:

```typescript
// Legacy API supports userIds/clientIds filtering
await stub.broadcast("announcements", data, {
  userIds: ["admin", "moderator"]
});

// Socket.IO-like API doesn't support filtering
// Use legacy API if you need this feature
```

### Benefits of Socket.IO-like API

1. **Unified API**: Same event-based pattern as direct actor methods
2. **Familiar**: Matches Socket.IO server-side API naming conventions
3. **Type-safe**: Proper TypeScript support with clear method signatures
4. **Consistent**: Event-based messaging aligns with Socket.IO conventions
5. **Direct**: Simple, direct method calls without complex builder patterns

## Common RPC Issues

### Issue: RPC calls failing with "Method not found"

**Solutions:**

1. Ensure you're using the stub, not the class directly:
```typescript
// ✅ Correct - Socket.IO-like API (direct method call)
const stub = ChatRoom.get("room-id");
await stub.emitToUser("alice", "message", data);

// ✅ Correct - Legacy API
await stub.sendToUser("alice", "default", data);

// ❌ Wrong
await ChatRoom.emitToUser(...);
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

