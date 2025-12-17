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

## Step 2: Create a Connection Handler

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

// Handle messages (socket.io-like)
userConnection.on("chat.message", async (ctx, data) => {
  // Broadcast to everyone in the chat room
  await ctx.emit.toRoom("chat").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});

// Export handlers
export const UserConnection = createConnectionHandler(userConnection);
export const ChatRoom = createRoomHandler({ name: "ChatRoom" });
```

## Step 3: Export the DO Classes

Update `src/index.ts`:

```typescript
import { UserConnection, ChatRoom } from "./actors/connection";

// Export Durable Object classes
export { UserConnection, ChatRoom };

// Route WebSocket connections
export default {
  async fetch(request: Request) {
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

**Important**: Export names must match `class_name` in `wrangler.jsonc`.

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

- **ConnectionDO** = A Durable Object that owns ONE WebSocket per user
- **RoomDO** = A Durable Object that coordinates room membership and broadcasts
- **joinRoom()** = Join a room (membership persisted across hibernation)
- **Emit** = Send messages (`ctx.emit.toRoom("chat").emit("event", data)`)
- **on()** = Listen for events (`connection.on("event", handler)`)

For more details, see the [Concepts](../concepts/) section.
