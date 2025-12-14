# RPC Guide

Call Actor methods from Workers or other Actors.

## Basics

Get an Actor stub and call methods:

```typescript
// Get stub
const stub = ChatRoom.get("room-id");

// Send to user
await stub.sendToUser("alice", "default", {
  type: "notification",
  message: "Hello"
});

// Broadcast to channel
await stub.broadcast("default", {
  type: "announcement",
  text: "Hello everyone"
});

// Query state
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

## Important Rules

**1. Use same Actor ID for WebSocket and RPC:**

```typescript
const actorId = "chat-room-123";

// WebSocket connection
ChatRoom.get(actorId).fetch(wsRequest);

// RPC call - must use same ID!
const stub = ChatRoom.get(actorId);
await stub.sendToUser("alice", "default", data);
```

**2. Always await RPC calls:**

```typescript
// ✅ Correct
const count = await stub.getSessionCount();

// ❌ Wrong
const count = stub.getSessionCount();
```

**3. Use stub, not class:**

```typescript
// ✅ Correct
const stub = ChatRoom.get("room-id");
await stub.sendToUser(...);

// ❌ Wrong
await ChatRoom.sendToUser(...);
```

## Error Handling

RPC calls can fail. Always wrap in try/catch:

```typescript
try {
  await stub.sendToUser(userId, "default", data);
} catch (error) {
  // Actor might be hibernating - retry or return error
  console.error("RPC failed:", error);
}
```

## Performance Tips

- Use `Promise.all()` for parallel calls
- Batch operations when possible
- Cache actor state queries

```typescript
// ✅ Good: Parallel
const [count, userIds] = await Promise.all([
  stub.getSessionCount(),
  stub.getConnectedUserIds()
]);

// ❌ Bad: Sequential
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

## Available RPC Methods

- `sendToUser(userId, channel, data)` - Send to specific user
- `broadcast(channel, data, options?)` - Broadcast to channel
- `getSessionCount()` - Get connection count
- `getConnectedUserIds()` - Get list of user IDs
- `cleanupStaleSessions()` - Remove stale connections

## Example: HTTP Endpoint

```typescript
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === "/api/notify" && request.method === "POST") {
      const { userId, message } = await request.json();
      
      const stub = ChatRoom.get("chat-room");
      
      try {
        await stub.sendToUser(userId, "default", {
          type: "notification",
          message
        });
        
        return Response.json({ success: true });
      } catch (error) {
        return Response.json(
          { error: "Failed to send" },
          { status: 503 }
        );
      }
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

## Related

- [Server API - RPC Methods](../api/server.md#actorstub---rpc-methods)
- [Examples - RPC](../examples/rpc.md)
- [Configuration](./configuration.md)
