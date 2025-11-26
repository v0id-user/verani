# Verani

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
```

### Server Side (Cloudflare Worker)

```typescript
import { defineRoom, createActorHandler } from "verani";

// Define your room with lifecycle hooks
export const chatRoom = defineRoom({
  name: "chat",

  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected`);
    ctx.actor.broadcast("default", {
      type: "user.joined",
      userId: ctx.meta.userId
    });
  },

  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      // Broadcast to everyone except sender
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: ctx.meta.userId,
        text: frame.data.text
      }, { except: ctx.ws });
    }
  },

  onDisconnect(ctx) {
    console.log(`User ${ctx.meta.userId} disconnected`);
  }
});

// Export the Actor handler
export default createActorHandler(chatRoom);
```

### Client Side

```typescript
import { VeraniClient } from "verani";

// Connect to your Cloudflare Worker
const client = new VeraniClient("wss://your-worker.dev/ws?userId=alice");

// Listen for messages
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
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
// Server: broadcast to specific channel
ctx.actor.broadcast("game-updates", data);

// Client: joins "default" channel automatically
// You can implement join/leave for custom channels
```

### Hibernation

Verani handles Cloudflare's hibernation automatically:

- Connection metadata survives hibernation via WebSocket attachments
- Sessions are restored when the Actor wakes up
- No manual state management needed

## Documentation

- **[Getting Started](./docs/GETTING_STARTED.md)** - Step-by-step tutorial
- **[Mental Model](./docs/MENTAL_MODEL.md)** - Understanding Verani's architecture
- **[API Reference](./docs/API.md)** - Complete API documentation
- **[Examples](./docs/EXAMPLES.md)** - Common usage patterns

## Features

### Server (Actor) Side

- Room-based architecture with lifecycle hooks
- WebSocket attachment management for hibernation
- Selective broadcasting with filters
- User and client ID tracking
- Error boundaries and logging
- Flexible metadata extraction from requests

### Client Side

- Automatic reconnection with exponential backoff
- Connection state management
- Message queueing when disconnected
- Event-based API (on/off/once/emit)
- Promise-based connection waiting
- Lifecycle callbacks

## Project Status

Verani is in active development. Current version is an MVP focused on core functionality:

- Core realtime messaging
- Hibernation support
- Client reconnection
- Presence protocol (coming soon)
- Persistent storage integration (coming soon)
- React/framework adapters (coming soon)

## License

ISC

## Contributing

Contributions welcome! Please read our contributing guidelines first.

