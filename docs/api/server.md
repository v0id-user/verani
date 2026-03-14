# Server Side API

Complete server-side API documentation for Verani.

> **Looking for type safety?** See the [Typed API](./typed.md) for tRPC-like type-safe contracts with `createTypedRoom()`. Import from `verani/typed`.

---

## Per-Connection Architecture

The recommended architecture uses one Durable Object per user connection, with separate coordination DOs for room management.

### `defineConnection<TMeta, E, TState>(definition)`

Defines a connection handler for per-user Durable Objects.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Environment type (default: `unknown`)
- `TState extends Record<string, unknown>` - Persisted state type

**Parameters:**
- `definition: ConnectionDefinition<TMeta, E, TState>` - Connection configuration

**Returns:** `ConnectionDefinitionWithHandlers<TMeta, E, TState>` - Extended definition with `.on()` and `.off()` methods

**Example:**

```typescript
import { defineConnection, createConnectionHandler } from "verani";

const userConnection = defineConnection({
  name: "UserConnection",
  websocketPath: "/ws",
  // Map room names to wrangler.toml binding names
  rooms: {
    presence: "PresenceRoom",
    chat: "ChatRoom"
  },
  // Binding name for user-to-user messaging
  connectionBinding: "UserConnection",

  extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const user = validateToken(token);
    return {
      userId: user.id,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: user.name
    };
  },

  async onConnect(ctx) {
    await ctx.actor.joinRoom("presence", { username: ctx.meta.username });
  },

  async onDisconnect(ctx) {
    // Room leave is handled automatically
  }
});

// Register event handlers
userConnection.on("chat", async (ctx, data) => {
  await ctx.emit.toRoom("chat").emit("chat:message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

export const UserConnection = createConnectionHandler(userConnection);
```

### `ConnectionDefinition<TMeta, E, TState>`

Configuration object for a connection handler.

**Properties:**

#### `name?: string`
Optional name for debugging and Actor binding resolution.

#### `websocketPath?: string`
WebSocket upgrade path (default: `"/ws"`).

#### `rooms?: Record<string, string>`
Map of room names to their environment binding keys. Must match binding names in `wrangler.toml`. Required for room features (`joinRoom`, `toRoom`, etc.).

```typescript
rooms: { "presence": "PresenceRoom", "chat": "ChatRoom" }
```

#### `connectionBinding?: string`
Environment binding key for the ConnectionDO class. Required for user-to-user messaging (`toUser`).

#### `extractMeta?(req: Request): TMeta | Promise<TMeta>`
Extract metadata from the WebSocket upgrade request.

#### `onConnect?(ctx: ConnectionContext): void | Promise<void>`
Called when WebSocket connection is established.

#### `onDisconnect?(ctx: ConnectionContext): void | Promise<void>`
Called when WebSocket connection is closed.

#### `onMessage?(ctx: ConnectionContext, frame: unknown): void | Promise<void>`
Called when a message is received (fallback if no handler matches).

#### `onError?(error: Error, ctx: ConnectionContext): void | Promise<void>`
Called when an error occurs.

#### `onHibernationRestore?(actor: ConnectionHandlerInstance): void | Promise<void>`
Called after waking from hibernation. Room re-joining is handled automatically by the SDK.

#### `onDestroy?(ctx: ConnectionContext): void | Promise<void>`
Called before the actor is destroyed and all storage is cleared. Use for cleanup (leaving rooms, notifying services).

#### `state?: TState`
Initial state for this connection.

#### `persistedKeys?: (string & keyof TState)[]`
Keys from `state` to persist to storage.

### `createConnectionHandler<TMeta, E, TState>(definition)`

Creates a ConnectionDO class from a connection definition.

**Parameters:**
- `definition: ConnectionDefinition<TMeta, E, TState>` - Connection definition

**Returns:** `ConnectionHandlerClass<E>` - Durable Object class

**Example:**

```typescript
export const UserConnection = createConnectionHandler(userConnection);

// In Worker:
const userId = extractUserId(request);
const stub = UserConnection.get(userId); // Per-user DO
return stub.fetch(request);
```

### `ConnectionContext<TMeta, E, TState>`

Context object passed to connection lifecycle hooks.

**Properties:**

- `actor` - The ConnectionDO instance
- `ws: WebSocket | null` - The WebSocket connection
- `meta: TMeta` - Connection metadata
- `emit: ConnectionEmit` - Emit API for sending messages
- `state: TState` - Persisted state

### Connection Emit API

The `ctx.emit` object provides methods for sending messages:

```typescript
// Emit to this connection's WebSocket
ctx.emit.emit("event", { data: "value" });

// Emit to a room (via RoomDO RPC)
await ctx.emit.toRoom("chat").emit("message", { text: "Hello" });

// Emit to a specific user (via ConnectionDO RPC)
await ctx.emit.toUser("alice").emit("notification", { message: "Hi" });
```

**Note:** `toRoom()` and `toUser()` return async emit builders that use RPC.

---

### `createRoomHandler<E>(definition)`

Creates a RoomDO class for room coordination.

**Parameters:**
- `definition: RoomCoordinatorDefinition<E>` - Room coordinator definition

**Returns:** `RoomHandlerClass<E>` - Durable Object class

**Example:**

```typescript
import { createRoomHandler } from "verani";

export const ChatRoom = createRoomHandler({
  name: "ChatRoom",
  connectionBinding: "UserConnection",

  async onJoin(roomState, userId, metadata) {
    console.log(`User ${userId} joined`);
  },

  async onLeave(roomState, userId) {
    console.log(`User ${userId} left`);
  }
});
```

In the recommended per-connection architecture, a **RoomDO** created with `createRoomHandler()` is a **coordination Durable Object only**: it owns no WebSockets, tracks room membership, and fans out messages to `createConnectionHandler()`-based ConnectionDOs via RPC. It should be exported as its own Durable Object class (for example, `export const ChatRoom = createRoomHandler({ ... })`) so Wrangler can bind it separately from your per-user `UserConnection` DO.

### `RoomCoordinatorDefinition<E>`

Configuration for a RoomDO.

**Properties:**

#### `name?: string`
Optional name for debugging and Actor binding resolution.

#### `connectionBinding?: string`
Environment binding key for the ConnectionDO class. Required for broadcast message delivery.

#### `maxDeliveryFailures?: number`
Maximum consecutive delivery failures before a member is automatically removed. Default: `3`.

#### `onInit?(roomState: Record<string, unknown>): void | Promise<void>`
Called when RoomDO initializes or wakes from hibernation.

#### `onJoin?(roomState, userId, metadata?): void | Promise<void>`
Called when a user joins this room.

#### `onLeave?(roomState, userId): void | Promise<void>`
Called when a user leaves this room.

#### `onDestroy?(roomState: Record<string, unknown>): void | Promise<void>`
Called before the actor is destroyed and all storage is cleared.

### RoomDO RPC Methods

RoomDOs expose these RPC methods:

```typescript
const roomStub = ChatRoom.get("room-name");

// Add user to room
await roomStub.join(userId, { username: "Alice" });

// Remove user from room
await roomStub.leave(userId);

// Broadcast to all room members
await roomStub.broadcast("event", data, { exceptUserId: senderId });

// Get room members
const members = await roomStub.getMembers();

// Get member count
const count = await roomStub.getMemberCount();

// Check membership
const isMember = await roomStub.hasMember(userId);
```

---

## Wrangler Configuration (Per-Connection)

Binding names **must match** the values you pass to `rooms`, `connectionBinding`, etc. in your definitions.

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "class_name": "UserConnection",
        "name": "UserConnection"
      },
      {
        "class_name": "PresenceRoom",
        "name": "PresenceRoom"
      },
      {
        "class_name": "ChatRoom",
        "name": "ChatRoom"
      }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["UserConnection", "PresenceRoom", "ChatRoom"],
      "tag": "v1"
    }
  ]
}
```

---

## Related Documentation

- [Client API](./client.md) - Client-side API reference
- [Types](./types.md) - Type definitions
- [Utilities](./utilities.md) - Utility functions

