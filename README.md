# Verani

<div align="center">

[![MADE BY #V0ID](https://img.shields.io/badge/MADE%20BY%20%23V0ID-F3EEE1.svg?style=for-the-badge)](https://github.com/v0id-user)

**Build realtime apps on Cloudflare with Socket.io-like simplicity**

[Getting Started](#quick-start) • [Documentation](./docs/) • [Examples](./examples/)

</div>

Verani brings the familiar developer experience of Socket.io to Cloudflare's Durable Objects (Actors), with proper hibernation support and minimal overhead. Build realtime chat, presence systems, notifications, and more—all running on Cloudflare's edge.

## ✨ Why Verani?

- **🎯 Familiar API**: If you've used Socket.io, you already know how to use Verani
- **💤 Hibernation Support**: Properly handles Cloudflare Actor hibernation out of the box
- **🔒 Type Safe**: Built with TypeScript, full type safety throughout
- **🧠 Simple Mental Model**: Rooms, channels, and broadcast semantics that just make sense
- **⚡ Modern DX**: Automatic reconnection, error handling, and connection lifecycle management
- **🌍 Edge-Ready**: Built for Cloudflare Workers and Durable Objects

## 🚀 Quick Start

Get a realtime chat app running in 5 minutes.

### Step 1: Install

```bash
npm install verani @cloudflare/actors
```

**Don't have a Cloudflare Worker project?** Create one:

```bash
npm create cloudflare@latest my-verani-app
cd my-verani-app
npm install verani @cloudflare/actors
```

### Step 2: Create Your Room

Create `src/actors/chat.actor.ts`:

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  onConnect(ctx) {
    // Notify others when someone joins
    ctx.actor.emit.to("default").emit("user.joined", {
      userId: ctx.meta.userId
    });
  },

  onDisconnect(ctx) {
    // Notify others when someone leaves
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId
    });
  }
});

// Handle messages (socket.io-like API)
chatRoom.on("chat.message", (ctx, data) => {
  // Broadcast to everyone in the "default" channel
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});
```

### Step 3: Wire Up Your Worker

Update `src/index.ts`:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./actors/chat.actor";

// Convert room definition to Durable Object class
export const ChatRoom = createActorHandler(chatRoom);

// Route WebSocket connections
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith("/ws")) {
      // Get or create the Actor instance
      const stub = ChatRoom.get("chat-room");
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
        "class_name": "ChatRoom",  // Must match export name above
        "name": "CHAT"              // Binding name (used internally by Cloudflare)
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

**Important**: The export name `ChatRoom` must match `class_name` in `wrangler.jsonc`.

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

**That's it!** You now have a working realtime chat app. 🎉

**Need more help?** Check out the [Quick Start Guide](./docs/getting-started/quick-start.md) for detailed examples.

## 📚 Documentation

- **[Getting Started](./docs/getting-started/)** - Installation and quick start guide
- **[API Reference](./docs/api/)** - Complete server and client API documentation
- **[Guides](./docs/guides/)** - Configuration, deployment, scaling, and RPC
- **[Examples](./docs/examples/)** - Common usage patterns and code samples
- **[Concepts](./docs/concepts/)** - Architecture, hibernation, and core concepts
- **[Security](./docs/security/)** - Authentication, authorization, and best practices

## 🎯 Key Concepts

- **Room** = A Durable Object that handles WebSocket connections
- **Channel** = A group within a room (default: `"default"`)
- **Emit** = Send messages (`ctx.actor.emit.to("channel").emit("event", data)`)
- **Hibernation** = Handled automatically, no manual work needed

## ✨ Features

### Server-Side
- **Socket.io-like API**: `room.on()`, `ctx.actor.emit.to()`, familiar patterns
- **Lifecycle Hooks**: `onConnect`, `onDisconnect`, `onMessage` for full control
- **RPC Support**: Call Actor methods directly from Workers
- **Automatic Hibernation**: Handles Cloudflare Actor hibernation seamlessly
- **Persistent State**: Built-in support for state that survives hibernation
- **Type Safety**: Full TypeScript support with type inference

### Client-Side
- **Automatic Reconnection**: Exponential backoff with configurable retry logic
- **Message Queueing**: Messages queued when disconnected, sent on reconnect
- **Keepalive**: Built-in ping/pong to detect dead connections
- **Event-Based API**: Familiar `on()`, `emit()`, `once()`, `off()` methods
- **Connection State**: Track connection lifecycle (`connecting`, `connected`, `disconnected`)

## 🎮 Try the Examples

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

## 🌟 Real-World Example

**[Vchats](https://github.com/v0id-user/vchats)** - A complete chat application built with Verani


## License

ISC

## Contributing

Contributions welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

