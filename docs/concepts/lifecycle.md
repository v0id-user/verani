# Connection Lifecycle

Understanding the connection lifecycle on both server and client.

## Server Side

```
Actor starts / wakes from hibernation
      ↓
onInit() called
      ↓
  ├─ Restore sessions from attachments
  └─ Initialize persisted state (if defined)
      ↓
WebSocket connects
      ↓
extractMeta(request)  → { userId, clientId, channels }
      ↓
storeAttachment(ws, meta)
      ↓
sessions.set(ws, { ws, meta })
      ↓
onConnect(ctx)  → ctx.emit available, ctx.actor.state ready
      ↓
[connection active, messages flow]
      ↓
Event handlers (connection.on())
      ↓
State changes automatically persisted (if persistedKeys defined)
      ↓
WebSocket closes
      ↓
sessions.delete(ws)
      ↓
onDisconnect(ctx)  → ctx.emit available
      ↓
Actor may hibernate (state persists)
      ↓
Actor destroyed (evicted or explicit)
      ↓
onDestroy(ctx)  → cleanup, leave rooms, close sockets
```

## Lifecycle Hooks with Socket.io-like API

**onConnect** - Called when a connection is established:

```typescript
const connection = defineConnection({
  onConnect(ctx) {
    // ctx.emit is available here
    ctx.emit("welcome", { message: "Connected!" });
  }
});
```

**Event Handlers** - Handle incoming messages (recommended):

```typescript
connection.on("chat.message", (ctx, data) => {
  // ctx.emit is available here
  ctx.emit.toRoom("chat").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

**onDisconnect** - Called when a connection closes:

```typescript
const connection = defineConnection({
  onDisconnect(ctx) {
    // ctx.emit is available here
    ctx.emit.toRoom("chat").emit("user.left", {
      userId: ctx.meta.userId
    });
  }
});
```

**onDestroy** - Called when the Actor is destroyed (evicted or explicitly):

```typescript
const connection = defineConnection({
  onDestroy(ctx) {
    // Cleanup: notify other services, flush analytics, etc.
    // Room leave and WebSocket close are handled automatically
  }
});
```

ConnectionDOs automatically leave all rooms and close the WebSocket before calling `onDestroy`. Use this hook for external cleanup (analytics, third-party APIs, etc.).

RoomDOs also support `onDestroy`:

```typescript
createRoomHandler({
  name: "ChatRoom",
  connectionBinding: "UserConnection",
  onDestroy(ctx) {
    // Room-level cleanup
  }
});
```

**Sending Messages:** Verani provides emit APIs for sending messages:
- `ctx.emit("event", data)` - Send to current socket
- `ctx.emit.toRoom(roomName).emit("event", data)` - Broadcast to room via RPC
- `ctx.emit.toUser(userId).emit("event", data)` - Send to specific user via RPC

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

## State Initialization

If your room defines persisted state, it's initialized during `onInit`:

```typescript
const connection = defineConnection({
  state: {
    count: 0,
    lastActivity: null as Date | null
  },
  persistedKeys: ["count", "lastActivity"],

  onConnect(ctx) {
    // State is ready here - loaded from storage
    console.log(`Current count: ${ctx.state.count}`);

    // Changes are automatically persisted
    ctx.state.count++;
  }
});
```

**Timeline:**
1. `onInit()` - State loaded from Durable Object storage
2. `onConnect()` - State is ready and accessible
3. State changes - Automatically persisted to storage
4. Hibernation - State survives in storage
5. Wake - State restored in `onInit()`
6. `onDestroy()` - Final cleanup before Actor is evicted

## Related Documentation

- [Architecture](./architecture.md) - System architecture
- [Hibernation](./hibernation.md) - Hibernation behavior
- [Persistence](./persistence.md) - State persistence guide
- [State Management](./state-management.md) - State types overview
- [Server API - Lifecycle Hooks](../api/server.md#roomdefinitiontmeta) - Hook documentation
- [Client API](../api/client.md) - Client lifecycle methods

