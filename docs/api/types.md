# Type Exports

All types exported from Verani.

## Type Exports

All types are exported from the main package:

```typescript
import type {
  // Server types
  RoomDefinition,
  RoomDefinitionWithHandlers,
  RoomContext,
  MessageContext,
  ConnectionMeta,
  MessageFrame,
  BroadcastOptions,
  RpcBroadcastOptions,
  VeraniActor,
  ActorStub,
  ActorHandlerClass,
  EventHandler,
  RoomEventEmitter,

  // Client types
  VeraniClientOptions,
  ConnectionState,
  ReconnectionConfig,

  // Shared types
  ClientMessage,
  ServerMessage,
  VeraniMessage
} from "verani";
```

## Server Types

### `ConnectionMeta`

Base metadata structure for connections.

```typescript
interface ConnectionMeta {
  userId: string;
  clientId: string;
  channels: string[];
}
```

**Extending:**

```typescript
interface CustomMeta extends ConnectionMeta {
  username: string;
  avatar?: string;
  role: "user" | "admin";
}
```

### `MessageFrame`

Structure of messages sent over WebSocket.

```typescript
interface MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}
```

### `BroadcastOptions`

Options for filtering broadcast recipients. Use this when calling `broadcast()` directly on the Actor instance (inside lifecycle hooks).

```typescript
interface BroadcastOptions {
  except?: WebSocket;        // Exclude this connection (not available via RPC)
  userIds?: string[];        // Only send to these users
  clientIds?: string[];      // Only send to these clients
}
```

**Note:** For RPC calls, use `RpcBroadcastOptions` instead, which excludes the `except` option.

### `EventHandler<TMeta, E>`

Event handler function type for socket.io-like event handling. Used with `room.on()` and `room.off()` methods.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)

```typescript
type EventHandler<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> = (
  ctx: MessageContext<TMeta, E>,
  data: any
) => void | Promise<void>;
```

**Example:**

```typescript
const room = defineRoom<CustomMeta>({ /* ... */ });

// Handler receives properly typed context
room.on("chat.message", (ctx, data) => {
  // ctx is typed as MessageContext<CustomMeta, E>
  // ctx.meta has type CustomMeta with all custom properties
  console.log(ctx.meta.username); // ✅ Type-safe access
});
```

### `RoomEventEmitter<TMeta, E>`

Event emitter interface for room-level event handling. Provides socket.io-like event registration and removal.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)

```typescript
interface RoomEventEmitter<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown> {
  on(event: string, handler: EventHandler<TMeta, E>): void;
  off(event: string, handler?: EventHandler<TMeta, E>): void;
  emit(event: string, ctx: MessageContext<TMeta, E>, data: any): Promise<void>;
}
```

**Example:**

```typescript
import { createRoomEventEmitter } from "verani";

const customEmitter = createRoomEventEmitter<CustomMeta>();

const room = defineRoom({
  eventEmitter: customEmitter,
  // ... other config
});
```

### `RoomDefinitionWithHandlers<TMeta, E>`

Extended room definition returned by `defineRoom()` with socket.io-like convenience methods.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)

Extends `RoomDefinition<TMeta, E>` and adds:
- `on(event: string, handler: EventHandler<TMeta, E>): void`
- `off(event: string, handler?: EventHandler<TMeta, E>): void`
- `eventEmitter: RoomEventEmitter<TMeta, E>`

See [Server API](./server.md#roomdefinitionwithhandlerstmeta-e) for complete documentation.

### `RpcBroadcastOptions`

RPC-safe version of `BroadcastOptions` for use over RPC calls. Excludes the `except` field since WebSocket cannot be serialized.

```typescript
interface RpcBroadcastOptions {
  /** Only send to specific user IDs */
  userIds?: string[];
  /** Only send to specific client IDs */
  clientIds?: string[];
}
```

**Comparison:**

```typescript
// Inside lifecycle hook - can use except
ctx.actor.broadcast("default", data, {
  except: ctx.ws,           // ✅ Available
  userIds: ["alice", "bob"]
});

// Via RPC - use RpcBroadcastOptions
await stub.broadcast("default", data, {
  except: ctx.ws,           // ❌ Not available - WebSocket can't be serialized
  userIds: ["alice", "bob"] // ✅ Available
});
```

## Client Types

### `ConnectionState`

Connection state values.

```typescript
type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";
```

### `VeraniClientOptions`

See [Client API](./client.md#veraniclientoptions) for details.

### `ReconnectionConfig`

See [Client API](./client.md#reconnectionconfig) for details.

## Related Documentation

- [Server API](./server.md) - Server-side API reference
- [Client API](./client.md) - Client-side API reference
- [Utilities](./utilities.md) - Utility functions

