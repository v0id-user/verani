# Verani

<div align="center">

[![MADE BY #V0ID](https://img.shields.io/badge/MADE%20BY%20%23V0ID-F3EEE1.svg?style=for-the-badge)](https://github.com/v0id-user)

</div>

> A simple, focused realtime SDK for Cloudflare Actors with Socket.io-like semantics

Verani brings the familiar developer experience of Socket.io to Cloudflare's Durable Objects (Actors), with proper hibernation support and minimal overhead.

## Why Verani?

- **Familiar API**: If you've used Socket.io, you already know how to use Verani
- **Hibernation Support**: Properly handles Cloudflare Actor hibernation out of the box
- **Type Safe**: Built with TypeScript, full type safety throughout
- **Simple Mental Model**: Rooms, channels, and broadcast semantics that just make sense
- **Production Ready**: Automatic reconnection, error handling, and connection lifecycle management

## Quick Start

### Installation

```bash
npm install verani @cloudflare/actors
# or
bun add verani @cloudflare/actors
```

### Server Side (Cloudflare Worker)

```typescript
import { defineRoom, createActorHandler } from "verani";

// Define your room with lifecycle hooks
export const chatRoom = defineRoom({
  name: "chat",
  websocketPath: "/chat",

  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected`);
    // Use emit API (socket.io-like)
    ctx.actor.emit.to("default").emit("user.joined", {
      userId: ctx.meta.userId
    });
  },

  onDisconnect(ctx) {
    console.log(`User ${ctx.meta.userId} disconnected`);
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId
    });
  }
});

// Register event handlers (socket.io-like, recommended)
chatRoom.on("chat.message", (ctx, data) => {
  // Broadcast to all in default channel
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});

// Create the Durable Object class
export const ChatRoom = createActorHandler(chatRoom);
```

### Wrangler Configuration

**Critical**: Your Durable Object export names in `src/index.ts` **must match** the `class_name` in `wrangler.jsonc`:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // Must match export name
        "name": "ChatRoom"              // Binding name in env
      }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["ChatRoom"],
      "tag": "v1"
    }
  ]
}
```

The three-way relationship:
1. **Export** in `src/index.ts`: `export { ChatRoom }`
2. **Class name** in `wrangler.jsonc`: `"class_name": "ChatRoom"`
3. **Env binding**: Access via `env.ChatRoom` in your fetch handler

### Client Side

```typescript
import { VeraniClient } from "verani";

// Connect to your Cloudflare Worker with ping/pong keepalive
const client = new VeraniClient("wss://your-worker.dev/ws?userId=alice", {
  pingInterval: 5000,  // Send ping every 5 seconds
  pongTimeout: 5000,  // Expect pong within 5 seconds
  reconnection: {
    enabled: true,
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000
  }
});

// Listen for messages
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});

client.on("user.joined", (data) => {
  console.log(`User ${data.userId} joined`);
});

// Send messages
client.emit("chat.message", { text: "Hello, world!" });

// Handle connection lifecycle
client.onOpen(() => {
  console.log("Connected!");
});

client.onStateChange((state) => {
  console.log("Connection state:", state);
});

// Wait for connection before sending
await client.waitForConnection();
client.emit("ready", {});
```

## Key Concepts

### Actors = Rooms

Each Cloudflare Actor instance represents a **logical container** for realtime communication:

- **Chat room**: All users in the same chat share one Actor
- **User notifications**: Each user gets their own Actor
- **Game session**: Each game instance is one Actor

### Channels

Inside an Actor, connections can join **channels** for selective message routing:

```typescript
// Server: broadcast to specific channel using emit API
ctx.actor.emit.to("game-updates").emit("update", data);

// Or send to a specific user (all their sessions)
ctx.emit.to("alice").emit("notification", { message: "Hello!" });

// Client: joins "default" channel automatically
// You can implement join/leave for custom channels
```

### Hibernation

Verani handles Cloudflare's hibernation automatically:

- Connection metadata survives hibernation via WebSocket attachments
- Sessions are restored when the Actor wakes up
- No manual state management needed

## Documentation

- **[Getting Started](./docs/getting-started/)** - Installation and quick start guide
- **[API Reference](./docs/api/)** - Complete server and client API documentation
- **[Guides](./docs/guides/)** - Configuration, deployment, scaling, and RPC
- **[Examples](./docs/examples/)** - Common usage patterns and code samples
- **[Concepts](./docs/concepts/)** - Architecture, hibernation, and core concepts
- **[Security](./docs/security/)** - Authentication, authorization, and best practices

## Features

### Server (Actor) Side

- **Socket.io-like event handlers** - `room.on()` and `room.off()` for clean event handling
- **Emit API** - `ctx.emit` and `ctx.actor.emit.to()` for intuitive message sending
- Room-based architecture with lifecycle hooks (`onConnect`, `onDisconnect`, `onHibernationRestore`)
- WebSocket attachment management for hibernation
- Selective broadcasting with filters (userIds, clientIds, except)
- User and client ID tracking
- **RPC methods** - Call Actor methods remotely from Workers or other Actors
- Durable Object storage access for persistent state
- Error boundaries and logging
- Flexible metadata extraction from requests

### Client Side

- Automatic reconnection with exponential backoff
- Connection state management (`getState()`, `getConnectionState()`, `isConnecting`)
- Message queueing when disconnected
- Event-based API (on/off/once/emit)
- Promise-based connection waiting (`waitForConnection()`)
- Lifecycle callbacks (`onOpen`, `onClose`, `onError`, `onStateChange`)
- **Ping/pong keepalive** with automatic Page Visibility API resync
- Configurable connection timeout and queue size

### RPC Support

Call Actor methods remotely from Workers or other Actors:

```typescript
// In your Worker fetch handler
const stub = ChatRoom.get("room-id");

// Send to user
await stub.sendToUser("alice", "notifications", {
  type: "alert",
  message: "You have a new message"
});

// Broadcast to channel
await stub.broadcast("default", { type: "announcement", text: "Hello!" });

// Query state
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

- Send messages to users from HTTP endpoints
- Query actor state remotely
- Broadcast from external events or scheduled tasks
- Coordinate between multiple Actors

## Live Examples

Try out Verani with working examples:

```bash
# Clone and run
git clone https://github.com/v0id-user/verani
cd verani
bun install  # or npm install
bun run dev  # or npm run dev

# Open http://localhost:8787
```

See `examples/` for chat, presence, and notifications demos!

## Project Status

Verani is in active development. Current version includes:

**Implemented:**
- Core realtime messaging
- Hibernation support
- Client reconnection
- Presence protocol with multi-device support
- Persistent storage integration with Durable Object storage

**Coming Soon:**
- React/framework adapters

## License

ISC

## Contributing

Contributions welcome! Please read our contributing guidelines first.

