# Type Exports

All types exported from Verani.

## Type Exports

All types are exported from the main package:

```typescript
import type {
  // Server types
  ConnectionDefinition,
  ConnectionDefinitionWithHandlers,
  ConnectionContext,
  ConnectionHandlerClass,
  ConnectionMeta,
  ConnectionEmit,
  AsyncEmitBuilder,
  ConnectionActorStub,
  RoomActorStub,
  RoomHandlerClass,
  RoomMember,
  RoomCoordinatorDefinition,
  MessageFrame,
  BroadcastOptions,
  RpcBroadcastOptions,
  VeraniEnv,

  // Persistence types
  SafePersistOptions,
  PersistableActor,

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
interface MessageFrame<TData = unknown> {
  type: string;
  channel?: string;
  data?: TData;
}
```

### `BroadcastOptions`

Options for filtering broadcast recipients.

```typescript
interface BroadcastOptions {
  except?: WebSocket;        // Exclude this connection (not available via RPC)
  userIds?: string[];        // Only send to these users
  clientIds?: string[];      // Only send to these clients
}
```

**Note:** For RPC calls, use `RpcBroadcastOptions` instead, which excludes the `except` option.

### `ConnectionDefinition<TMeta, E, TState>`

Connection definition returned by `defineConnection()` with event handling methods.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type (default: `unknown`)
- `TState extends Record<string, unknown>` - State type

Provides:
- `on(event: string, handler): void` - Register event handler
- `off(event: string): void` - Remove event handlers

### `ConnectionContext<TMeta, E, TState>`

Context passed to lifecycle hooks and event handlers.

```typescript
interface ConnectionContext<TMeta, E, TState> {
  actor: ConnectionHandlerInstance<TMeta, E, TState>;
  ws: WebSocket | null;
  meta: TMeta;
  emit: ConnectionEmit<TMeta>;
  state: TState;
}
```

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

## Typed API Types

For type-safe contracts with full TypeScript inference, see the [Typed API](./typed.md).

**Contract Types (from `verani/typed/shared`):**

```typescript
import type {
  // Contract definition
  Contract,
  ContractDefinition,
  EventMap,
  PayloadMarker,

  // Type inference
  ServerEventNames,
  ClientEventNames,
  ServerPayload,
  ClientPayload,
  InferChannels,

  // Validation
  Validator,
  ValidatedContract,
} from "verani/typed/shared";
```

**Server Types (from `verani/typed`):**

```typescript
import type {
  TypedConnection,
  TypedConnectionConfig,
  TypedConnectionContext,
  TypedMessageContext,
  TypedEventHandler,
} from "verani/typed";
```

**Client Types (from `verani/typed/client`):**

```typescript
import type {
  TypedClient,
} from "verani/typed/client";
```

## Related Documentation

- [Server API](./server.md) - Server-side API reference
- [Client API](./client.md) - Client-side API reference
- [Typed API](./typed.md) - Type-safe contracts (tRPC-like)
- [Utilities](./utilities.md) - Utility functions
