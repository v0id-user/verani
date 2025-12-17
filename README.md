# Verani

<div align="center">

[![MADE BY #V0ID](https://img.shields.io/badge/MADE%20BY%20%23V0ID-F3EEE1.svg?style=for-the-badge)](https://github.com/v0id-user)

Build realtime apps on Cloudflare with Socket.io-like simplicity

[Getting Started](#quick-start) • [Documentation](./docs/) • [Examples](./examples/)

</div>

Verani brings the familiar developer experience of Socket.io to Cloudflare's Durable Objects (Actors), with proper hibernation support and minimal overhead. Build realtime chat, presence systems, notifications, and more—all running on Cloudflare's edge.

## Why Verani?

- **Familiar API**: If you've used Socket.io, you already know how to use Verani
- **Horizontally scalable**: Per-connection architecture - each user gets their own Durable Object
- **Hibernation support**: Handles Cloudflare Actor hibernation automatically
- **Type safe**: Built with TypeScript, full type safety throughout
- **Simple mental model**: Connections, rooms, and broadcast semantics that just make sense
- **Modern DX**: Automatic reconnection, error handling, and connection lifecycle management
- **Edge-ready**: Built for Cloudflare Workers and Durable Objects
- **Cost-efficient**: Idle connections hibernate and cost nothing

## Quick Start

Get a realtime chat app running in 5 minutes.

### Step 1: Install

```bash
npm install verani @cloudflare/actors
```

Don't have a Cloudflare Worker project? Create one:

```bash
npm create cloudflare@latest my-verani-app
cd my-verani-app
npm install verani @cloudflare/actors
```

### Step 2: Create Your Connection Handler

Create `src/actors/connection.ts`:

```typescript
import { defineConnection, createConnectionHandler, createRoomHandler } from "verani";

// Define connection handler (one WebSocket per user)
const userConnection = defineConnection({
  name: "UserConnection",

  extractMeta(req) {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || crypto.randomUUID();
    return {
      userId,
      clientId: crypto.randomUUID(),
      channels: ["default"]
    };
  },

  async onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected`);
    // Join chat room (persisted across hibernation)
    await ctx.actor.joinRoom("chat");
  },

  async onDisconnect(ctx) {
    console.log(`User ${ctx.meta.userId} disconnected`);
    // Room leave is handled automatically
  }
});

// Handle messages (socket.io-like API)
userConnection.on("chat.message", async (ctx, data) => {
  // Broadcast to everyone in the chat room
  await ctx.emit.toRoom("chat").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});

// Export the connection handler
export const UserConnection = createConnectionHandler(userConnection);

// Export the room coordinator
export const ChatRoom = createRoomHandler({ name: "ChatRoom" });
```

### Step 3: Wire Up Your Worker

Update `src/index.ts`:

```typescript
import { UserConnection, ChatRoom } from "./actors/connection";

// Export Durable Object classes
export { UserConnection, ChatRoom };

// Route WebSocket connections
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws")) {
      // Extract userId and route to user-specific DO
      const userId = url.searchParams.get("userId") || crypto.randomUUID();
      const stub = UserConnection.get(userId);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

### Step 4: Configure Wrangler

Update `wrangler.jsonc`:

```jsonc
{
  "name": "my-verani-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  "durable_objects": {
    "bindings": [
      {
        "class_name": "UserConnection",
        "name": "CONNECTION_DO"
      },
      {
        "class_name": "ChatRoom",
        "name": "ROOM_DO"
      }
    ]
  },

  "migrations": [
    {
      "new_sqlite_classes": ["UserConnection", "ChatRoom"],
      "tag": "v1"
    }
  ]
}
```

Important: Export names must match `class_name` in `wrangler.jsonc`.

### Step 5: Build Your Client

```typescript
import { VeraniClient } from "verani/client";

const client = new VeraniClient("ws://localhost:8787/ws?userId=alice");

// Listen for messages
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});

client.on("user.joined", (data) => {
  console.log(`User ${data.userId} joined!`);
});

// Send messages
client.emit("chat.message", { text: "Hello, world!" });

// Wait for connection (optional)
await client.waitForConnection();
```

### Step 6: Run It!

```bash
# Start the server
npm run dev
# or
wrangler dev

# In another terminal, run your client
# (or open multiple browser tabs with your client code)
```

That's it! You now have a working realtime chat app.

Need more help? Check out the [Quick Start Guide](./docs/getting-started/quick-start.md) for detailed examples.

## Documentation

- [Live Documentation](https://verani-docs.cloudflare-c49.workers.dev/docs/getting-started/installation) - Installation and quick start guide
- [Getting Started](./docs/getting-started/) - Installation and quick start guide
- [API Reference](./docs/api/) - Complete server and client API documentation
- [Guides](./docs/guides/) - Configuration, deployment, scaling, and RPC
- [Examples](./docs/examples/) - Common usage patterns and code samples
- [Concepts](./docs/concepts/) - Architecture, hibernation, and core concepts
- [Security](./docs/security/) - Authentication, authorization, and best practices

## Key Concepts

- **ConnectionDO** = A Durable Object that owns ONE WebSocket per user
- **RoomDO** = A Durable Object that coordinates room membership and broadcasts
- **Emit** = Send messages (`ctx.emit.toRoom("chat").emit("event", data)`)
- **Hibernation** = Handled automatically, state persisted and restored

## Features

### Server-Side
- **Per-connection DOs**: Each user gets their own Durable Object (horizontally scalable)
- **Socket.io-like API**: `connection.on()`, `ctx.emit.toRoom()`, familiar patterns
- **Room coordination**: RoomDOs manage membership and broadcast via RPC
- **Lifecycle hooks**: `onConnect`, `onDisconnect`, `onMessage` for full control
- **RPC support**: DO-to-DO communication for message delivery
- **Automatic hibernation**: State persisted and restored automatically
- **Persistent state**: Built-in support for state that survives hibernation
- **Type safety**: Full TypeScript support with type inference

### Client-Side
- **Automatic reconnection**: Exponential backoff with configurable retry logic
- **Message queueing**: Messages queued when disconnected, sent on reconnect
- **Keepalive**: Built-in ping/pong to detect dead connections
- **Event-based API**: Familiar `on()`, `emit()`, `once()`, `off()` methods
- **Connection state**: Track connection lifecycle (`connecting`, `connected`, `disconnected`)

## Try the Examples

See Verani in action with working examples:

```bash
git clone https://github.com/v0id-user/verani
cd verani
bun install && bun run dev
```

Then in another terminal, try:

```bash
# Chat room example
bun run examples/clients/chat-client.ts

# Presence tracking
bun run examples/clients/presence-client.ts

# Notifications feed
bun run examples/clients/notifications-client.ts
```

See the [Examples README](./examples/README.md) for more details.

## Real-World Example

[Vchats](https://github.com/v0id-user/vchats) - A complete chat application built with Verani


## License

ISC

## Contributing

Contributions welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

