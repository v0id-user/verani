# Connection Lifecycle

Understanding the connection lifecycle on both server and client.

## Server Side

```
WebSocket connects
      ↓
extractMeta(request)  → { userId, clientId, channels }
      ↓
storeAttachment(ws, meta)
      ↓
sessions.set(ws, { ws, meta })
      ↓
onConnect(ctx)  → ctx.emit available
      ↓
[connection active, messages flow]
      ↓
Event handlers (room.on()) or onMessage hook
      ↓
WebSocket closes
      ↓
sessions.delete(ws)
      ↓
onDisconnect(ctx)  → ctx.emit available
```

## Lifecycle Hooks with Socket.io-like API

**onConnect** - Called when a connection is established:

```typescript
const room = defineRoom({
  onConnect(ctx) {
    // ctx.emit is available here
    ctx.emit.emit("welcome", { message: "Connected!" });
    ctx.actor.emit.to("default").emit("user.joined", {
      userId: ctx.meta.userId
    });
  }
});
```

**Event Handlers** - Handle incoming messages (recommended):

```typescript
room.on("chat.message", (ctx, data) => {
  // ctx.emit is available here
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

**onDisconnect** - Called when a connection closes:

```typescript
const room = defineRoom({
  onDisconnect(ctx) {
    // ctx.emit is available here
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId
    });
  }
});
```

**Note:** The traditional `onMessage` hook is still supported as a fallback when no event handlers match.

## Client Side

```
new VeraniClient(url)
      ↓
State: "connecting"
      ↓
WebSocket opens
      ↓
State: "connected"
      ↓
[connection active, messages flow]
      ↓
WebSocket closes (unexpected)
      ↓
State: "reconnecting"
      ↓
Exponential backoff delay
      ↓
Retry connection
```

## Related Documentation

- [Architecture](./architecture.md) - System architecture
- [Hibernation](./hibernation.md) - Hibernation behavior
- [Server API - Lifecycle Hooks](../api/server.md#roomdefinitiontmeta) - Hook documentation
- [Client API](../api/client.md) - Client lifecycle methods

