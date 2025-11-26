# API Reference

Complete API documentation for Verani.

## Server Side API

### `defineRoom<TMeta>(definition)`

Defines a room with lifecycle hooks and metadata extraction.

**Type Parameters:**
- `TMeta extends ConnectionMeta` - Custom metadata type

**Parameters:**
- `definition: RoomDefinition<TMeta>` - Room configuration object

**Returns:** `RoomDefinition<TMeta>`

**Example:**

```typescript
const room = defineRoom({
  name: "chat",
  extractMeta(req) { /* ... */ },
  onConnect(ctx) { /* ... */ },
  onMessage(ctx, frame) { /* ... */ },
  onDisconnect(ctx) { /* ... */ },
  onError(error, ctx) { /* ... */ }
});
```

---

### `createActorHandler<TMeta>(room)`

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

### `RoomDefinition<TMeta>`

Configuration object for a room.

**Properties:**

#### `name?: string`

Optional room name for debugging.

#### `extractMeta?(req: Request): TMeta | Promise<TMeta>`

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

#### `onConnect?(ctx: RoomContext<TMeta>): void | Promise<void>`

Called when a new WebSocket connection is established.

**Example:**

```typescript
onConnect(ctx) {
  console.log(`User ${ctx.meta.userId} connected`);
  ctx.actor.broadcast("default", {
    type: "user.joined",
    userId: ctx.meta.userId
  });
}
```

#### `onMessage?(ctx: MessageContext<TMeta>, frame: MessageFrame): void | Promise<void>`

Called when a message is received from a connection.

**Example:**

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

#### `onDisconnect?(ctx: RoomContext<TMeta>): void | Promise<void>`

Called when a WebSocket connection is closed.

**Example:**

```typescript
onDisconnect(ctx) {
  console.log(`User ${ctx.meta.userId} left`);
  ctx.actor.broadcast("default", {
    type: "user.left",
    userId: ctx.meta.userId
  });
}
```

#### `onError?(error: Error, ctx: RoomContext<TMeta>): void | Promise<void>`

Called when an error occurs in a lifecycle hook.

**Example:**

```typescript
onError(error, ctx) {
  console.error(`Error for ${ctx.meta.userId}:`, error);
  // Send error to monitoring service
  reportError(error, { userId: ctx.meta.userId });
}
```

---

### `RoomContext<TMeta>`

Context object passed to lifecycle hooks.

**Properties:**

- `actor: VeraniActor` - The Actor instance
- `ws: WebSocket` - The WebSocket connection
- `meta: TMeta` - Connection metadata

**Example:**

```typescript
onConnect(ctx) {
  const { actor, ws, meta } = ctx;
  console.log(`Actor has ${actor.getSessionCount()} connections`);
}
```

---

### `MessageContext<TMeta>`

Context for the `onMessage` hook (extends `RoomContext`).

**Properties:**

- All properties from `RoomContext`
- `frame: MessageFrame` - The received message frame

---

### `VeraniActor`

The Actor instance with Verani-specific methods.

#### `broadcast(channel: string, data: any, options?): number`

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

#### `getSessionCount(): number`

Returns the number of active WebSocket connections.

**Example:**

```typescript
const count = ctx.actor.getSessionCount();
console.log(`${count} users online`);
```

#### `getConnectedUserIds(): string[]`

Returns array of unique user IDs currently connected.

**Example:**

```typescript
const userIds = ctx.actor.getConnectedUserIds();
console.log(`Online users: ${userIds.join(', ')}`);
```

#### `getUserSessions(userId: string): WebSocket[]`

Gets all WebSocket connections for a specific user.

**Example:**

```typescript
const sessions = ctx.actor.getUserSessions("alice");
console.log(`Alice has ${sessions.length} tabs open`);
```

#### `sendToUser(userId: string, type: string, data?: any): number`

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

---

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

---

### `MessageFrame`

Structure of messages sent over WebSocket.

```typescript
interface MessageFrame {
  type: string;
  channel?: string;
  data?: any;
}
```

---

### `BroadcastOptions`

Options for filtering broadcast recipients.

```typescript
interface BroadcastOptions {
  except?: WebSocket;        // Exclude this connection
  userIds?: string[];        // Only send to these users
  clientIds?: string[];      // Only send to these clients
}
```

---

## Client Side API

### `new VeraniClient(url, options?)`

Creates a new Verani WebSocket client.

**Parameters:**
- `url: string` - WebSocket URL (wss://...)
- `options?: VeraniClientOptions` - Client configuration

**Example:**

```typescript
const client = new VeraniClient(
  "wss://my-worker.dev/ws?userId=alice",
  {
    reconnection: {
      enabled: true,
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 1.5
    },
    maxQueueSize: 100,
    connectionTimeout: 10000
  }
);
```

---

### `client.on(event, callback)`

Registers an event listener.

**Parameters:**
- `event: string` - Event type to listen for
- `callback: (data: any) => void` - Handler function

**Example:**

```typescript
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});
```

---

### `client.off(event, callback)`

Removes an event listener.

**Example:**

```typescript
const handler = (data) => console.log(data);
client.on("event", handler);
client.off("event", handler);
```

---

### `client.once(event, callback)`

Registers a one-time event listener.

**Example:**

```typescript
client.once("welcome", (data) => {
  console.log("First message received:", data);
});
```

---

### `client.emit(type, data?)`

Sends a message to the server.

**Parameters:**
- `type: string` - Message type
- `data?: any` - Optional message data

**Example:**

```typescript
client.emit("chat.message", { text: "Hello!" });
client.emit("ping"); // No data
```

---

### `client.getState(): ConnectionState`

Returns the current connection state.

**Returns:** `"connecting" | "connected" | "disconnected" | "reconnecting" | "error"`

**Example:**

```typescript
if (client.getState() === "connected") {
  console.log("Ready to send");
}
```

---

### `client.isConnected(): boolean`

Checks if the client is currently connected.

**Example:**

```typescript
if (client.isConnected()) {
  client.emit("message", data);
}
```

---

### `client.waitForConnection(): Promise<void>`

Returns a promise that resolves when connected.

**Example:**

```typescript
await client.waitForConnection();
console.log("Now connected!");
client.emit("ready", {});
```

---

### `client.onOpen(callback)`

Registers a callback for when the connection opens.

**Example:**

```typescript
client.onOpen(() => {
  console.log("Connected!");
  updateUI("online");
});
```

---

### `client.onClose(callback)`

Registers a callback for when the connection closes.

**Example:**

```typescript
client.onClose((event) => {
  console.log(`Closed: ${event.code} ${event.reason}`);
});
```

---

### `client.onError(callback)`

Registers a callback for connection errors.

**Example:**

```typescript
client.onError((error) => {
  console.error("Connection error:", error);
});
```

---

### `client.onStateChange(callback)`

Registers a callback for state changes.

**Example:**

```typescript
client.onStateChange((state) => {
  console.log("State:", state);
  updateStatusIndicator(state);
});
```

---

### `client.reconnect()`

Manually triggers a reconnection.

**Example:**

```typescript
button.onclick = () => {
  client.reconnect();
};
```

---

### `client.disconnect()`

Closes the connection without reconnecting.

**Example:**

```typescript
window.onbeforeunload = () => {
  client.disconnect();
};
```

---

### `client.close()`

Closes the connection and cleans up all resources.

**Example:**

```typescript
// Component unmounting
onDestroy(() => {
  client.close();
});
```

---

### `VeraniClientOptions`

Client configuration options.

```typescript
interface VeraniClientOptions {
  reconnection?: Partial<ReconnectionConfig>;
  maxQueueSize?: number;
  connectionTimeout?: number;
}
```

---

### `ReconnectionConfig`

Reconnection behavior configuration.

```typescript
interface ReconnectionConfig {
  enabled: boolean;          // Enable auto-reconnection
  maxAttempts: number;       // Max attempts (0 = infinite)
  initialDelay: number;      // Initial delay in ms
  maxDelay: number;          // Maximum delay in ms
  backoffMultiplier: number; // Exponential backoff multiplier
}
```

**Defaults:**

```typescript
{
  enabled: true,
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 1.5
}
```

---

## Utility Functions

### `parseJWT(token: string): any`

Basic JWT token parser (payload only, no verification).

**Parameters:**
- `token: string` - JWT token string

**Returns:** Decoded payload or `null` if invalid

**Example:**

```typescript
import { parseJWT } from "verani";

const payload = parseJWT(token);
if (payload) {
  console.log("User ID:", payload.sub);
}
```

**Note:** This does NOT verify signatures. Use a proper JWT library for production authentication.

---

### `storeAttachment(ws: WebSocket, meta: ConnectionMeta)`

Stores metadata in WebSocket attachment for hibernation survival.

**Note:** Usually called automatically by the Actor runtime.

---

### `restoreSessions(actor: VeraniActor)`

Restores sessions from WebSocket attachments after hibernation.

**Note:** Called automatically in `onInit()`.

---

## Type Exports

All types are exported from the main package:

```typescript
import type {
  // Server types
  RoomDefinition,
  RoomContext,
  MessageContext,
  ConnectionMeta,
  MessageFrame,
  BroadcastOptions,
  VeraniActor,

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

