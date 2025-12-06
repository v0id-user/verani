# Type-Safe API

Verani Typed provides tRPC-like type safety for WebSocket communication. Define a contract once, get fully typed APIs on both server and client.

## Overview

The typed abstraction layer consists of:

- **Contract**: A single source of truth defining all events and their payloads
- **Typed Server**: `createTypedRoom()` with typed event handlers and emit
- **Typed Client**: `createTypedClient()` with typed listeners and emit
- **Validation**: Optional runtime validation with Zod integration

## Quick Start

### 1. Define the Contract

Create a shared contract that defines all events:

```typescript
// contracts/chat.ts
import { defineContract, payload } from "verani/typed";

export const chatContract = defineContract({
  // Events the SERVER sends TO the client
  serverEvents: {
    "chat.message": payload<{ from: string; text: string; timestamp: number }>(),
    "user.joined": payload<{ userId: string; username: string }>(),
    "user.left": payload<{ userId: string }>(),
    "users.sync": payload<{ users: string[]; count: number }>(),
  },
  // Events the CLIENT sends TO the server
  clientEvents: {
    "message.send": payload<{ text: string }>(),
    "typing.start": payload<{ conversationId: string }>(),
    "typing.stop": payload<{ conversationId: string }>(),
  },
  // Optional: typed channels
  channels: ["default", "announcements"] as const,
});
```

### 2. Create Typed Server Room

```typescript
// rooms/chat.ts
import { createTypedRoom, createActorHandler } from "verani/typed";
import { chatContract } from "../contracts/chat";

interface ChatMeta {
  userId: string;
  clientId: string;
  channels: string[];
  username: string;
}

const room = createTypedRoom(chatContract, {
  websocketPath: "/ws/chat",

  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") ?? crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: url.searchParams.get("username") ?? "Anonymous",
    };
  },

  onConnect(ctx) {
    // ctx.emit is typed - only serverEvents allowed
    ctx.emit("user.joined", {
      userId: ctx.meta.userId,
      username: ctx.meta.username,
    });

    // ctx.actor.emit for broadcasting
    ctx.actor.emit.to("default").emit("users.sync", {
      users: ctx.actor.getConnectedUserIds(),
      count: ctx.actor.getSessionCount(),
    });
  },

  onDisconnect(ctx) {
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId,
    });
  },
});

// Handle client events with fully typed data
room.handle("message.send", (ctx, data) => {
  // data: { text: string } - inferred from contract!
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now(),
  });
});

room.handle("typing.start", (ctx, data) => {
  // data: { conversationId: string }
  console.log(`${ctx.meta.userId} started typing in ${data.conversationId}`);
});

// Export for Cloudflare Workers
export default createActorHandler(room.definition);
```

### 3. Create Typed Client

```typescript
// client/chat.ts
import { createTypedClient } from "verani/typed/client";
import { chatContract } from "../contracts/chat";

const client = createTypedClient(chatContract, "wss://example.com/ws/chat", {
  reconnection: { enabled: true, maxAttempts: 10 },
});

// Listening - only serverEvents allowed, data is typed
client.on("chat.message", (data) => {
  // data: { from: string; text: string; timestamp: number }
  console.log(`${data.from}: ${data.text}`);
});

client.on("user.joined", (data) => {
  // data: { userId: string; username: string }
  console.log(`${data.username} joined the chat`);
});

// Emitting - only clientEvents allowed, data is typed
client.emit("message.send", { text: "Hello, world!" });

// TypeScript Error: "chat.message" is not a clientEvent!
// client.emit("chat.message", { ... });
```

---

## Contract Definition

### `defineContract(definition)`

Creates a typed contract for Verani communication.

**Parameters:**

- `definition.serverEvents` - Events the server sends to clients
- `definition.clientEvents` - Events clients send to the server
- `definition.channels` - Optional array of valid channel names

**Example:**

```typescript
import { defineContract, payload } from "verani/typed";

const contract = defineContract({
  serverEvents: {
    "notification": payload<{ title: string; body: string }>(),
    "status.update": payload<{ online: boolean }>(),
  },
  clientEvents: {
    "notification.read": payload<{ id: string }>(),
    "status.set": payload<{ status: "online" | "away" | "busy" }>(),
  },
  channels: ["default", "private"] as const,
});
```

### `payload<T>()`

Type marker for defining payload shapes. Zero runtime cost.

```typescript
// Simple payload
payload<{ message: string }>()

// Complex payload
payload<{
  user: { id: string; name: string };
  metadata: Record<string, unknown>;
  items: Array<{ id: string; value: number }>;
}>()

// Optional fields
payload<{ required: string; optional?: number }>()
```

---

## Server API

### `createTypedRoom(contract, config)`

Creates a type-safe room based on a contract.

**Type Parameters:**

- `C extends Contract` - The contract type
- `TMeta extends ConnectionMeta` - Custom metadata type
- `E` - Actor environment type

**Parameters:**

- `contract` - The contract defining events
- `config` - Room configuration

**Config Options:**

```typescript
interface TypedRoomConfig<C, TMeta, E> {
  name?: string;                    // Room name for debugging
  websocketPath?: string;           // WebSocket path (default: "/ws")
  extractMeta?(req: Request): TMeta | Promise<TMeta>;
  onConnect?(ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;
  onDisconnect?(ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;
  onError?(error: Error, ctx: TypedRoomContext<C, TMeta, E>): void | Promise<void>;
  onHibernationRestore?(actor: VeraniActor<TMeta, E>): void | Promise<void>;
}
```

**Returns:** `TypedRoom<C, TMeta, E>`

### `room.handle(event, handler)`

Registers a typed event handler for a client event.

```typescript
room.handle("message.send", (ctx, data) => {
  // data is typed as { text: string }
  // ctx.emit only accepts serverEvents
  ctx.emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now(),
  });
});
```

### `room.off(event, handler?)`

Removes event handlers.

```typescript
room.off("message.send"); // Remove all handlers for this event
```

### `room.definition`

The underlying room definition for use with `createActorHandler()`.

```typescript
export default createActorHandler(room.definition);
```

### Typed Context

The context passed to lifecycle hooks and handlers includes typed emit:

```typescript
interface TypedRoomContext<C, TMeta, E> {
  actor: VeraniActor<TMeta, E> & {
    emit: TypedActorEmit<C, TMeta>;
  };
  ws: WebSocket;
  meta: TMeta;
  emit: TypedSocketEmit<C, TMeta>;
}
```

**Emit API:**

```typescript
// Emit to current socket
ctx.emit("server.event", { data: "value" });

// Emit to specific user or channel
ctx.emit.to("userId").emit("notification", { ... });

// Actor-level broadcast
ctx.actor.emit.to("default").emit("announcement", { ... });
```

---

## Client API

### `createTypedClient(contract, url, options?)`

Creates a type-safe client based on a contract.

**Parameters:**

- `contract` - The contract defining events
- `url` - WebSocket URL
- `options` - Optional client configuration

**Returns:** `TypedClient<C>`

### `client.on(event, callback)`

Registers a typed listener for server events.

```typescript
const unsubscribe = client.on("chat.message", (data) => {
  // data: { from: string; text: string; timestamp: number }
});

// Later: remove listener
unsubscribe();
```

### `client.off(event, callback)`

Removes a specific listener.

```typescript
const handler = (data) => console.log(data);
client.on("event", handler);
client.off("event", handler);
```

### `client.once(event, callback)`

Registers a one-time listener.

```typescript
client.once("welcome", (data) => {
  console.log("First message:", data);
});
```

### `client.emit(event, data)`

Sends a typed client event to the server.

```typescript
client.emit("message.send", { text: "Hello!" });

// TypeScript Error: wrong event direction
// client.emit("chat.message", { ... });
```

### Connection Methods

All standard connection methods are available:

```typescript
client.onOpen(() => console.log("Connected"));
client.onClose((event) => console.log("Closed:", event.code));
client.onError((error) => console.error(error));
client.onStateChange((state) => updateUI(state));

client.getState();           // "connecting" | "connected" | "disconnected" | "reconnecting" | "error"
client.isConnected();        // boolean
client.isConnecting;         // boolean (read-only)
client.getConnectionState(); // Detailed state info

await client.waitForConnection();
client.reconnect();
client.disconnect();
client.close();
```

### `client._client`

Access the underlying `VeraniClient` for escape hatches:

```typescript
// For advanced scenarios
client._client.emit("untyped.event", { raw: "data" });
```

---

## Optional Validation

Add runtime validation with Zod or any compatible validator.

### `withValidation(contract, config)`

Enriches a contract with validators.

```typescript
import { z } from "zod";
import { withValidation } from "verani/typed";

const validatedContract = withValidation(chatContract, {
  clientEvents: {
    "message.send": z.object({
      text: z.string().min(1).max(1000),
    }),
  },
  serverEvents: {
    "chat.message": z.object({
      from: z.string(),
      text: z.string(),
      timestamp: z.number(),
    }),
  },
  onValidationError: (event, error, direction) => {
    console.error(`Validation failed for ${event}:`, error.issues);
  },
});
```

**Validator Interface:**

Any object with a `safeParse` method works (Zod, Valibot, custom):

```typescript
interface Validator<T> {
  safeParse(data: unknown): 
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ message: string }> } };
}
```

---

## Type Inference Utilities

Extract types from contracts for advanced use cases.

### Event Names

```typescript
import type { ServerEventNames, ClientEventNames } from "verani/typed";

type ServerEvents = ServerEventNames<typeof chatContract>;
// "chat.message" | "user.joined" | "user.left" | "users.sync"

type ClientEvents = ClientEventNames<typeof chatContract>;
// "message.send" | "typing.start" | "typing.stop"
```

### Payload Types

```typescript
import type { ServerPayload, ClientPayload } from "verani/typed";

type MessagePayload = ServerPayload<typeof chatContract, "chat.message">;
// { from: string; text: string; timestamp: number }

type SendPayload = ClientPayload<typeof chatContract, "message.send">;
// { text: string }
```

### Channel Types

```typescript
import type { InferChannels } from "verani/typed";

type Channels = InferChannels<typeof chatContract>;
// "default" | "announcements"
```

---

## Best Practices

### 1. Share Contracts

Keep contracts in a shared location importable by both server and client:

```
src/
├── contracts/
│   ├── chat.ts
│   ├── notifications.ts
│   └── presence.ts
├── server/
│   └── rooms/
└── client/
    └── clients/
```

### 2. Use Descriptive Event Names

Follow a consistent naming convention:

```typescript
// Good: namespace.action
"chat.message"
"user.joined"
"typing.start"
"notification.read"

// Avoid: vague names
"msg"
"update"
"data"
```

### 3. Type Metadata

Always define custom metadata types:

```typescript
interface AppMeta extends ConnectionMeta {
  username: string;
  role: "user" | "admin";
  sessionId: string;
}

const room = createTypedRoom<typeof contract, AppMeta>(contract, {
  extractMeta(req) {
    // Return AppMeta
  },
});
```

### 4. Validate at Boundaries

Use validation for untrusted client input:

```typescript
const contract = withValidation(baseContract, {
  clientEvents: {
    "message.send": z.object({
      text: z.string().min(1).max(1000).trim(),
    }),
  },
  // Server events typically don't need validation
});
```

---

## Related Documentation

- [Server API](./server.md) - Core server-side API
- [Client API](./client.md) - Core client-side API
- [Types](./types.md) - Type definitions

