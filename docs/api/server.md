# Server Side API

Complete server-side API documentation for Verani.

## `defineRoom<TMeta, E>(definition)`

Defines a room with lifecycle hooks and metadata extraction.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)

**Parameters:**
- `definition: RoomDefinition<TMeta, E>` - Room configuration object

**Returns:** `RoomDefinitionWithHandlers<TMeta, E>` - Extended room definition with socket.io-like event handler methods (`on`, `off`)

**Example:**

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws", // Optional: defaults to "/ws"
  extractMeta(req) { /* ... */ },
  onConnect(ctx) { /* ... */ },
  onDisconnect(ctx) { /* ... */ },
  onError(error, ctx) { /* ... */ }
});

// Register event handlers (socket.io-like, recommended)
room.on("chat.message", (ctx, data) => {
  ctx.actor.emit.to("default").emit("chat.message", data);
});
```

---

## `createActorHandler<TMeta>(room)`

Creates a Cloudflare Actor handler from a room definition.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type

**Parameters:**
- `room: RoomDefinition<TMeta>` - Room definition from `defineRoom()`

**Returns:** Actor handler class for Cloudflare Workers

**Example:**

```typescript
export default createActorHandler(chatRoom);
```

---

## `RoomDefinition<TMeta>`

Configuration object for a room.

**Properties:**

### `name?: string`

Optional room name for debugging.

### `websocketPath?: string`

WebSocket upgrade path for this room (default: `"/ws"`).

This tells the Cloudflare Actors runtime which URL path should be used for WebSocket connections. The Actor will:
- Accept WebSocket upgrade requests at this path
- Return HTTP 404 for requests to different paths
- Return HTTP 426 (Upgrade Required) for non-WebSocket requests

**Default:** `"/ws"`

**Example:**

```typescript
export const chatRoom = defineRoom({
  websocketPath: "/chat", // Custom path
  // ... other hooks
});
```

**Important:** Verani only supports WebSocket connections. All non-WebSocket requests will be rejected with clear error messages.

### `extractMeta?(req: Request): TMeta | Promise<TMeta>`

Extracts connection metadata from the WebSocket upgrade request.

**Default behavior:**
- Extracts `userId` from query params or headers
- Generates random `clientId`
- Sets `channels: ["default"]`

**Example:**

```typescript
extractMeta(req) {
  const url = new URL(req.url);
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const payload = parseJWT(token);

  return {
    userId: payload.sub,
    clientId: crypto.randomUUID(),
    channels: ['default'],
    username: payload.name
  };
}
```

### `onConnect?(ctx: RoomContext<TMeta>): void | Promise<void>`

Called when a new WebSocket connection is established.

**Example:**

```typescript
onConnect(ctx) {
  console.log(`User ${ctx.meta.userId} connected`);
  // Use emit API (socket.io-like)
  ctx.actor.emit.to("default").emit("user.joined", {
    userId: ctx.meta.userId
  });
}
```

### `onMessage?(ctx: MessageContext<TMeta>, frame: MessageFrame): void | Promise<void>`

Called when a message is received from a connection.

**Note:** If event handlers are registered via `room.on()` or `room.eventEmitter.on()`, they take priority. This hook is used as a fallback when no matching event handler is found.

**Example (Traditional - Fallback):**

```typescript
onMessage(ctx, frame) {
  if (frame.type === "chat.message") {
    ctx.actor.broadcast("default", {
      type: "message",
      from: ctx.meta.userId,
      text: frame.data.text
    }, { except: ctx.ws });
  }
}
```

**Recommended: Socket.io-like Event Handlers**

Instead of using `onMessage`, register event handlers for a cleaner, more socket.io-like experience:

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws"
});

// Register event handlers (socket.io-like)
room.on("chat.message", (ctx, data) => {
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

room.on("notification.update", (ctx, data) => {
  ctx.emit.to(data.userId).emit("inbox_changed", {
    type: "inbox_changed"
  });
});
```

See [Event Handlers](#event-handlers) section below for more details.

### `onDisconnect?(ctx: RoomContext<TMeta>): void | Promise<void>`

Called when a WebSocket connection is closed.

**Example:**

```typescript
onDisconnect(ctx) {
  console.log(`User ${ctx.meta.userId} left`);
  // Use emit API (socket.io-like)
  ctx.actor.emit.to("default").emit("user.left", {
    userId: ctx.meta.userId
  });
}
```

### `onError?(error: Error, ctx: RoomContext<TMeta>): void | Promise<void>`

Called when an error occurs in a lifecycle hook.

**Example:**

```typescript
onError(error, ctx) {
  console.error(`Error for ${ctx.meta.userId}:`, error);
  // Send error to monitoring service
  reportError(error, { userId: ctx.meta.userId });
}
```

### `onHibernationRestore?(actor: VeraniActor): void | Promise<void>`

Called after the Actor wakes from hibernation and sessions are restored from WebSocket attachments.

Use this hook to:
- Reconcile durable storage with actual connected sessions
- Clean up stale data
- Send state sync messages to restored clients
- Ensure consistency after hibernation

**Parameters:**
- `actor: VeraniActor` - The actor instance with restored sessions

**Example:**

```typescript
async onHibernationRestore(actor) {
  console.log(`Actor restored with ${actor.sessions.size} sessions`);
  
  // Reconcile storage with actual connections
  const storedUsers = await loadUsersFromStorage(actor.getStorage());
  const connectedUserIds = new Set(
    Array.from(actor.sessions.values()).map(s => s.meta.userId)
  );
  
  // Clean up stale entries
  await actor.getStorage().transaction(async (txn) => {
    for (const [userId, userData] of storedUsers.entries()) {
      if (!connectedUserIds.has(userId)) {
        await txn.delete(`user:${userId}`);
      }
    }
  });
  
  // Send sync to all restored clients
  const syncData = await buildSyncData(actor.getStorage());
  for (const session of actor.sessions.values()) {
    session.ws.send(JSON.stringify({
      type: "sync",
      data: syncData
    }));
  }
}
```

**When does hibernation occur?**

Cloudflare Actors hibernate when:
- No requests have been received for a period of time
- No WebSocket messages have been sent/received
- The runtime decides to optimize resource usage

Sessions are automatically restored via WebSocket attachments, but application state must be reconciled manually using this hook.

**See:** [examples/presence-room.ts](../../examples/presence-room.ts) for a complete implementation.

### `eventEmitter?: RoomEventEmitter<TMeta>`

Optional event emitter for socket.io-like event handling. If not provided, a default event emitter is created automatically.

**Example:**

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws",
  // Custom event emitter (optional)
  eventEmitter: createRoomEventEmitter()
});
```

**See:** [Event Handlers](#event-handlers) section below for usage.

---

## `RoomContext<TMeta>`

Context object passed to lifecycle hooks.

**Properties:**

- `actor: VeraniActor` - The Actor instance
- `ws: WebSocket` - The WebSocket connection
- `meta: TMeta` - Connection metadata
- `emit: SocketEmit` - Socket.io-like emit API for this connection

**Example:**

```typescript
onConnect(ctx) {
  const { actor, ws, meta, emit } = ctx;
  console.log(`Actor has ${actor.getSessionCount()} connections`);
  
  // Send welcome message to this socket
  emit.emit("welcome", { message: "Connected!" });
}
```

**Emit API:**

The `emit` property provides a socket.io-like API:

```typescript
// Emit to current socket
ctx.emit.emit("event", { data: "value" });

// Emit to a specific user (all their sessions)
ctx.emit.to("userId").emit("notification", { message: "Hello" });

// Emit to a channel (broadcast)
ctx.emit.to("channel-name").emit("update", { value: 42 });
```

See [Emit API](#emit-api) section below for complete details.

---

## `MessageContext<TMeta>`

Context for the `onMessage` hook (extends `RoomContext`).

**Properties:**

- All properties from `RoomContext`
- `frame: MessageFrame` - The received message frame

**Example:**

```typescript
onMessage(ctx, frame) {
  // ctx.emit is available here too
  if (frame.type === "ping") {
    ctx.emit.emit("pong", { timestamp: Date.now() });
  }
}
```

---

## Event Handlers (Socket.io-like API)

Verani supports socket.io-like event handlers for a more familiar developer experience. Event handlers take priority over the `onMessage` hook when registered.

**Type Safety:** All event handlers are fully type-safe. The `ctx` parameter is typed as `MessageContext<TMeta, E>`, ensuring full IntelliSense support and type checking for metadata and actor methods.

### Registering Event Handlers

**Method 1: Using `room.on()` (Recommended)**

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws"
});

// Register handlers after room definition
room.on("chat.message", (ctx, data) => {
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

room.on("notification.update", (ctx, data) => {
  const userId = data.userId;
  if (!userId) {
    throw new Error("Missing userId");
  }
  ctx.emit.to(userId).emit("inbox_changed", { type: "inbox_changed" });
});
```

**Method 2: Using `room.eventEmitter.on()`**

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws"
});

room.eventEmitter.on("chat.message", (ctx, data) => {
  // Handler logic
});
```

### Removing Event Handlers

```typescript
// Remove specific handler
const handler = (ctx, data) => { /* ... */ };
room.on("event", handler);
room.off("event", handler);

// Remove all handlers for an event
room.off("event");
```

### Wildcard Handlers

Register a handler for all events:

```typescript
room.on("*", (ctx, data) => {
  console.log("Received event:", ctx.frame.type);
});
```

### Handler Priority

1. **Event handlers** registered via `room.on()` or `room.eventEmitter.on()`
2. **`onMessage` hook** (fallback if no handlers match)

Both systems can coexist - handlers take priority, but `onMessage` is called if no handler matches.

### Complete Example

```typescript
const room = defineRoom({
  name: "notifications",
  websocketPath: "/ws/notifications",
  
  onConnect(ctx) {
    ctx.emit.emit("welcome", { message: "Connected!" });
  }
});

// Register event handlers
room.on("notification.update", (ctx, data) => {
  const userId = data.userId;
  if (!userId) {
    throw new Error("Missing userId");
  }
  
  // Send to specific user
  ctx.emit.to(userId).emit("inbox_changed", {
    type: "inbox_changed"
  });
});

room.on("notification.mark-read", (ctx, data) => {
  // Broadcast to all in channel
  ctx.actor.emit.to("notifications").emit("read", {
    notificationId: data.id,
    userId: ctx.meta.userId
  });
});
```

---

## Emit API

Verani provides a socket.io-like emit API for sending messages. The emit API is available on both `RoomContext` (socket-level) and `VeraniActor` (actor-level).

### Socket-level Emit (`ctx.emit`)

Available on `RoomContext` and `MessageContext`. Allows emitting to:
- Current socket
- Specific user (all their sessions)
- Channel (broadcast)

**Methods:**

#### `emit(event: string, data?: any): void`

Emit to the current socket.

```typescript
onConnect(ctx) {
  ctx.emit.emit("welcome", { message: "Connected!" });
}
```

#### `to(target: string): EmitBuilder`

Target a specific user or channel for emitting.

- If `target` matches one of the current user's channels → treated as channel
- Otherwise → treated as userId

```typescript
// Emit to a user (all their sessions)
ctx.emit.to("alice").emit("notification", { message: "Hello Alice" });

// Emit to a channel
ctx.emit.to("default").emit("update", { value: 42 });
```

**Complete Example:**

```typescript
onMessage(ctx, frame) {
  if (frame.type === "notification.update") {
    const userId = frame.data.userId;
    
    // Send to specific user
    ctx.emit.to(userId).emit("inbox_changed", {
      type: "inbox_changed"
    });
  }
}
```

### Actor-level Emit (`ctx.actor.emit`)

Available on `VeraniActor`. Allows broadcasting to channels.

**Methods:**

#### `emit(event: string, data?: any): number`

Broadcast to default channel.

```typescript
ctx.actor.emit.emit("announcement", {
  message: "Server maintenance in 5 minutes"
});
```

#### `to(channel: string): EmitBuilder`

Target a specific channel for broadcasting.

```typescript
// Broadcast to a channel
ctx.actor.emit.to("default").emit("chat.message", {
  from: ctx.meta.userId,
  text: "Hello everyone!"
});

// Returns number of connections that received the message
const sentCount = ctx.actor.emit.to("general").emit("update", { value: 42 });
console.log(`Sent to ${sentCount} connections`);
```

**Complete Example:**

```typescript
room.on("chat.message", (ctx, data) => {
  // Broadcast to all in default channel
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});
```

### Message Format

All emit methods wrap messages in the standard Verani frame format:

```typescript
{
  type: "event",
  channel: "default", // or specified channel
  data: {
    type: "your-event-name",
    ...yourData
  }
}
```

The client automatically unwraps these messages and dispatches them as events.

---

## `VeraniActor`

The Actor instance with Verani-specific methods.

### `emit: ActorEmit`

Socket.io-like emit API for actor-level broadcasting. See [Emit API](#emit-api) section above.

### `broadcast(channel: string, data: any, options?): number`

Broadcasts a message to all connections in a channel.

**Parameters:**
- `channel: string` - Channel to broadcast to
- `data: any` - Data to send
- `options?: BroadcastOptions` - Filtering options

**Returns:** Number of connections that received the message

**Example:**

```typescript
// Broadcast to all in "default" channel
ctx.actor.broadcast("default", { type: "update", value: 42 });

// Broadcast except sender
ctx.actor.broadcast("default", data, { except: ctx.ws });

// Broadcast only to specific users
ctx.actor.broadcast("default", data, {
  userIds: ["alice", "bob"]
});

// Broadcast only to specific clients
ctx.actor.broadcast("default", data, {
  clientIds: ["client-123"]
});
```

### `getSessionCount(): number`

Returns the number of active WebSocket connections.

**Example:**

```typescript
const count = ctx.actor.getSessionCount();
console.log(`${count} users online`);
```

### `getConnectedUserIds(): string[]`

Returns array of unique user IDs currently connected.

**Example:**

```typescript
const userIds = ctx.actor.getConnectedUserIds();
console.log(`Online users: ${userIds.join(', ')}`);
```

### `getUserSessions(userId: string): WebSocket[]`

Gets all WebSocket connections for a specific user.

**Example:**

```typescript
const sessions = ctx.actor.getUserSessions("alice");
console.log(`Alice has ${sessions.length} tabs open`);
```

### `sendToUser(userId: string, type: string, data?: any): number`

Sends a message to all sessions of a specific user.

**Parameters:**
- `userId: string` - User ID to send to
- `type: string` - Message type
- `data?: any` - Optional message data

**Returns:** Number of sessions that received the message

**Example:**

```typescript
ctx.actor.sendToUser("alice", "notification", {
  title: "New Message",
  body: "You have 3 unread messages"
});
```

### `getStorage(): DurableObjectStorage`

Returns the Durable Object storage interface for persistent state management.

Use storage for:
- Persisting state across actor hibernation
- Atomic operations with transactions
- Consistent state management
- Historical data

**Returns:** `DurableObjectStorage` instance

**Example:**

```typescript
// Basic storage operations
async onConnect(ctx) {
  const storage = ctx.actor.getStorage();
  
  // Get value
  const count = await storage.get<number>("connectionCount") || 0;
  
  // Put value
  await storage.put("connectionCount", count + 1);
  
  // Delete value
  await storage.delete("oldKey");
}

// Atomic transactions for consistency
async onConnect(ctx) {
  await ctx.actor.getStorage().transaction(async (txn) => {
    // All operations in transaction are atomic
    const user = await txn.get<UserData>(`user:${ctx.meta.userId}`);
    const deviceCount = (user?.deviceCount || 0) + 1;
    
    await txn.put(`user:${ctx.meta.userId}`, {
      ...user,
      deviceCount,
      lastSeen: Date.now()
    });
  });
}

// List operations with prefix
async function getAllUsers(storage: DurableObjectStorage) {
  const users = new Map();
  const list = await storage.list<UserData>({ prefix: "user:" });
  
  for (const [key, value] of list.entries()) {
    users.set(key, value);
  }
  
  return users;
}
```

**Important:** Always use transactions when multiple operations need to be atomic. Without transactions, race conditions can occur during rapid connect/disconnect events.

**See:** [Durable Objects Storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/) for complete documentation.

---

## `RoomDefinitionWithHandlers<TMeta, E>`

Extended room definition returned by `defineRoom()` with socket.io-like convenience methods.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)

**Methods:**

### `on(event: string, handler: EventHandler<TMeta, E>): void`

Register an event handler (socket.io-like API).

**Type Parameters:**
- `handler: EventHandler<TMeta, E>` - Event handler function with properly typed context

```typescript
const room = defineRoom({ /* ... */ });
room.on("chat.message", (ctx, data) => {
  // ctx is typed as MessageContext<TMeta, E>
  // Handler logic
});
```

### `off(event: string, handler?: EventHandler<TMeta, E>): void`

Remove an event handler.

**Type Parameters:**
- `handler?: EventHandler<TMeta, E>` - Optional specific handler to remove

```typescript
// Remove specific handler
room.off("chat.message", handler);

// Remove all handlers for event
room.off("chat.message");
```

**Properties:**

All properties from `RoomDefinition`, plus:
- `eventEmitter: RoomEventEmitter` - The underlying event emitter instance

---

## `ActorStub` - RPC Methods

The Actor stub interface provides remote access to Actor methods from Workers or other Actors. These methods are called via RPC (Remote Procedure Calls) and always return Promises.

**Getting a stub:**
```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// Get Actor stub (variable name must match wrangler.jsonc class_name)
const stub = ChatRoom.get("room-id"); // Returns ActorStub
```

**Important differences from direct Actor methods:**
- RPC methods always return `Promise<T>` even if the underlying method is synchronous
- Use `RpcBroadcastOptions` instead of `BroadcastOptions` (excludes `except` WebSocket option)
- Only methods with serializable return types are available via RPC
- Methods like `getUserSessions()` and `getStorage()` are not available via RPC

### `stub.fetch(request: Request): Promise<Response>`

Standard fetch method for handling HTTP requests and WebSocket upgrades.

**Example:**
```typescript
const stub = ChatRoom.get("room-id");
const response = await stub.fetch(request);
```

### `stub.sendToUser(userId: string, channel: string, data?: any): Promise<number>`

Sends a message to a specific user (all their sessions) via RPC.

**Parameters:**
- `userId: string` - User ID to send to
- `channel: string` - Channel to send to
- `data?: any` - Optional message data

**Returns:** Promise resolving to the number of sessions that received the message

**Example:**
```typescript
const stub = ChatRoom.get("room-id");
const sentCount = await stub.sendToUser("alice", "notifications", {
  type: "alert",
  message: "You have a new message"
});
console.log(`Sent to ${sentCount} session(s)`);
```

### `stub.broadcast(channel: string, data: any, opts?: RpcBroadcastOptions): Promise<number>`

Broadcasts a message to all connections in a channel via RPC.

**Parameters:**
- `channel: string` - Channel to broadcast to
- `data: any` - Data to send
- `opts?: RpcBroadcastOptions` - Filtering options (userIds, clientIds)

**Returns:** Promise resolving to the number of connections that received the message

**Note:** The `except` option from `BroadcastOptions` is not available over RPC since WebSocket cannot be serialized.

**Example:**
```typescript
const stub = ChatRoom.get("room-id");

// Broadcast to all in channel
await stub.broadcast("default", { type: "announcement", text: "Hello!" });

// Broadcast only to specific users
await stub.broadcast("general", { type: "update" }, {
  userIds: ["alice", "bob"]
});

// Broadcast only to specific clients
await stub.broadcast("notifications", { type: "alert" }, {
  clientIds: ["client-123", "client-456"]
});
```

### `stub.getSessionCount(): Promise<number>`

Gets the total number of active sessions via RPC.

**Returns:** Promise resolving to the number of connected WebSockets

**Example:**
```typescript
const stub = ChatRoom.get("room-id");
const count = await stub.getSessionCount();
console.log(`${count} users online`);
```

### `stub.getConnectedUserIds(): Promise<string[]>`

Gets all unique user IDs currently connected via RPC.

**Returns:** Promise resolving to an array of unique user IDs

**Example:**
```typescript
const stub = ChatRoom.get("room-id");
const userIds = await stub.getConnectedUserIds();
console.log(`Online users: ${userIds.join(", ")}`);
```

### `stub.cleanupStaleSessions(): Promise<number>`

Removes all WebSocket sessions that are not in OPEN state via RPC.

**Returns:** Promise resolving to the number of sessions cleaned up

**Example:**
```typescript
const stub = ChatRoom.get("room-id");
const cleaned = await stub.cleanupStaleSessions();
console.log(`Cleaned up ${cleaned} stale sessions`);
```

**Complete RPC Example:**

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// In your Worker fetch handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === "/api/send-notification") {
      const { userId, message } = await request.json();
      
      // Get Actor stub (variable name must match wrangler.jsonc class_name)
      const stub = ChatRoom.get("chat-room");
      
      // Send notification via RPC
      const sentCount = await stub.sendToUser(userId, "notifications", {
        type: "notification",
        message,
        timestamp: Date.now()
      });
      
      return Response.json({ 
        success: true, 
        sentTo: sentCount 
      });
    }
    
    if (url.pathname === "/api/stats") {
      const stub = ChatRoom.get("chat-room");
      
      // Query actor state via RPC
      const [count, userIds] = await Promise.all([
        stub.getSessionCount(),
        stub.getConnectedUserIds()
      ]);
      
      return Response.json({
        onlineUsers: count,
        userIds
      });
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

For more RPC information, see the [RPC Guide](../guides/rpc.md).

---

## Related Documentation

- [Client API](./client.md) - Client-side API reference
- [Types](./types.md) - Type definitions
- [Utilities](./utilities.md) - Utility functions

