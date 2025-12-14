# Quick Start Guide

Get up and running with Verani in 5 minutes.

## Step 1: Install

```bash
npm install verani @cloudflare/actors
# or
bun add verani @cloudflare/actors
```

**Don't have a Cloudflare Worker project?** Create one:

```bash
npm create cloudflare@latest my-verani-app
cd my-verani-app
```

## Step 2: Create a Room

Create `src/actors/chat.actor.ts`:

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected`);
    // Notify others
    ctx.actor.emit.to("default").emit("user.joined", {
      userId: ctx.meta.userId
    });
  },

  onDisconnect(ctx) {
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId
    });
  }
});

// Handle messages (socket.io-like)
chatRoom.on("chat.message", (ctx, data) => {
  // Broadcast to everyone
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});
```

## Step 3: Export the Actor Class

Update `src/index.ts`:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./actors/chat.actor";

// Convert room to Durable Object class
const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// Route WebSocket connections
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith("/ws")) {
      const stub = ChatRoom.get("chat-room");
      return stub.fetch(request);
    }
    
    return new Response("Not Found", { status: 404 });
  }
};
```

**Important**: The export name `ChatRoom` must match `class_name` in `wrangler.jsonc`.

## Step 4: Configure Wrangler

Update `wrangler.jsonc`:

```jsonc
{
  "name": "my-verani-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  
  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // Must match export name
        "name": "CHAT"
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

## Step 5: Build a Client

```typescript
import { VeraniClient } from "verani";

const client = new VeraniClient(
  "wss://your-worker.dev/ws?userId=alice"
);

// Listen for messages
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});

client.on("user.joined", (data) => {
  console.log(`User ${data.userId} joined`);
});

// Send messages
client.emit("chat.message", { text: "Hello!" });

// Wait for connection
await client.waitForConnection();
```

## Step 6: Deploy

```bash
npx wrangler deploy
```

Your WebSocket endpoint: `wss://my-verani-app.your-subdomain.workers.dev/ws`

## That's It!

You now have a working realtime chat app. Open multiple browser tabs and watch messages sync in real-time.

## Next Steps

- **[Examples](../examples/)** - See more patterns (auth, channels, persistence)
- **[API Reference](../api/)** - Complete API docs
- **[Guides](../guides/)** - Configuration, deployment, RPC
- **[Troubleshooting](./troubleshooting.md)** - Common issues

## Key Concepts

- **Room** = A Durable Object that handles WebSocket connections
- **Channel** = A group within a room (default: `"default"`)
- **Emit** = Send messages (`ctx.actor.emit.to("channel").emit("event", data)`)
- **on()** = Listen for events (`room.on("event", handler)`)

For more details, see the [Concepts](../concepts/) section.
