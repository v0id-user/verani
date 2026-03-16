# Build a Real-Time Chat App with Verani

This tutorial walks you through building a complete real-time chat application from scratch using Verani and Cloudflare Workers. By the end, you'll have a working chat app deployed to Cloudflare.

**What you'll learn:**
- Setting up a Verani project
- Defining connection and room handlers
- Handling events (messages, typing, presence)
- Connecting from the browser
- Deploying to Cloudflare Workers

**Prerequisites:** Node.js or Bun installed, a Cloudflare account (free tier works).

---

## 1. Create the Project

```bash
mkdir verani-chat && cd verani-chat
npm init -y
```

Install dependencies:

```bash
npm install verani @cloudflare/actors
npm install -D wrangler typescript @cloudflare/workers-types
```

## 2. Configure Wrangler

Create `wrangler.jsonc`:

```jsonc
{
  "name": "verani-chat",
  "main": "src/worker.ts",
  "compatibility_date": "2025-11-26",
  "observability": { "enabled": true },
  "migrations": [
    {
      "new_sqlite_classes": ["UserConnection", "ChatRoom"],
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      { "class_name": "UserConnection", "name": "UserConnection" },
      { "class_name": "ChatRoom", "name": "ChatRoom" }
    ]
  }
}
```

> **The three-way match:** The `class_name` in bindings must match the exported class name, and the `name` must match what you pass to `connectionBinding` and `rooms`. If these don't match, you'll get cryptic runtime errors.

## 3. Define the Server

Create `src/worker.ts`:

```typescript
import { defineConnection, createConnectionHandler, createRoomHandler } from "verani";

// -- Types --

interface ChatMeta {
  userId: string;
  clientId: string;
  channels: string[];
  username: string;
}

// -- Connection Handler --

const chat = defineConnection<ChatMeta>({
  name: "UserConnection",
  websocketPath: "/ws",
  rooms: { chat: "ChatRoom" },
  connectionBinding: "UserConnection",

  // Extract user identity from the WebSocket upgrade request
  extractMeta(req) {
    const url = new URL(req.url);
    const username = url.searchParams.get("username") ?? "anonymous";
    return {
      userId: username,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username,
    };
  },

  // Called when a WebSocket connection is established
  async onConnect(ctx) {
    // Join the chat room (persisted — survives hibernation)
    await ctx.actor.joinRoom("chat", { username: ctx.meta.username });

    // Send a welcome event to THIS user only
    ctx.emit.emit("welcome", { username: ctx.meta.username });

    // Broadcast to ALL room members that someone joined
    await ctx.emit.toRoom("chat").emit("user:joined", {
      username: ctx.meta.username,
      timestamp: Date.now(),
    });
  },

  // Called when the WebSocket disconnects
  async onDisconnect(ctx) {
    await ctx.emit.toRoom("chat").emit("user:left", {
      username: ctx.meta.username,
      timestamp: Date.now(),
    });
  },
});

// -- Event Handlers --

// Handle incoming chat messages
chat.on<{ text: string }>("message", async (ctx, data) => {
  if (!data.text || typeof data.text !== "string") return;
  const text = data.text.trim().slice(0, 500);
  if (!text) return;

  // Broadcast to all room members (including sender)
  await ctx.emit.toRoom("chat").emit("message", {
    username: ctx.meta.username,
    text,
    timestamp: Date.now(),
  });
});

// Handle typing indicators
chat.on("typing", async (ctx) => {
  // Broadcast to everyone EXCEPT the sender
  await ctx.emit.toRoom("chat", { excludeSelf: true }).emit("typing", {
    username: ctx.meta.username,
  });
});

// -- Export Durable Objects --

export const UserConnection = createConnectionHandler(chat);

export const ChatRoom = createRoomHandler({
  name: "ChatRoom",
  connectionBinding: "UserConnection",
});

// -- Worker Entry Point --

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket upgrades to the user's ConnectionDO
    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username") ?? "anonymous";
      return UserConnection.get(username).fetch(request);
    }

    return new Response("Verani Chat — connect via WebSocket at /ws", {
      headers: { "Content-Type": "text/plain" },
    });
  },
} satisfies ExportedHandler<Env>;
```

### What's happening here?

1. **`defineConnection`** creates a connection definition with metadata extraction, lifecycle hooks, and event handlers.
2. **`extractMeta`** runs on every new WebSocket connection. The returned object is stored as the connection's metadata and attached to the WebSocket (survives hibernation).
3. **`chat.on("message", ...)`** registers an event handler. When the client sends `{ type: "message", data: { text: "hello" } }`, this handler runs.
4. **`ctx.emit.toRoom("chat")`** broadcasts to all members of the "chat" room via RPC to the RoomDO, which fans out to each member's ConnectionDO.
5. **`createConnectionHandler`** and **`createRoomHandler`** produce Durable Object classes that Cloudflare Workers can bind.

## 4. Run Locally

```bash
npx wrangler dev
```

Open `http://localhost:8787` — you'll see the plain text response. The WebSocket endpoint is at `/ws`.

## 5. Connect from the Browser

You can connect using raw WebSockets or the Verani client SDK.

### Option A: Raw WebSocket (no dependencies)

```javascript
const ws = new WebSocket("ws://localhost:8787/ws?username=alice");

// Send a message
function send(type, data) {
  ws.send(JSON.stringify({ type, data }));
}

// Receive messages
ws.onmessage = (e) => {
  const frame = JSON.parse(e.data);
  if (frame.type === "event" && frame.data?.type) {
    console.log(frame.data.type, frame.data);
  }
};

// Send a chat message
send("message", { type: "message", text: "Hello!" });
```

### Option B: Verani Client SDK

```bash
npm install verani
```

```typescript
import { VeraniClient } from "verani/client";

const client = new VeraniClient("ws://localhost:8787/ws?username=alice", {
  reconnection: { enabled: true, maxAttempts: 10, initialDelay: 500 },
});

client.on<{ username: string }>("welcome", (data) => {
  console.log(`Connected as ${data.username}`);
});

client.on<{ username: string; text: string }>("message", (data) => {
  console.log(`${data.username}: ${data.text}`);
});

client.on<{ username: string }>("user:joined", (data) => {
  console.log(`${data.username} joined`);
});

// Send a message
client.emit("message", { text: "Hello from the SDK!" });
```

The client SDK handles reconnection, keepalive pings, and message queuing automatically.

## 6. Deploy to Cloudflare

```bash
npx wrangler deploy
```

That's it. Your chat app is live. Replace `ws://localhost:8787` with `wss://your-worker.your-subdomain.workers.dev` in your client code.

## 7. Architecture Overview

```
Browser A ──WebSocket──→ ConnectionDO (alice)
                              │
                              │ RPC: toRoom("chat").emit(...)
                              ▼
                         RoomDO (chat)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              ConnDO(alice) ConnDO(bob) ConnDO(carol)
                    │         │         │
                    ▼         ▼         ▼
              Browser A   Browser B  Browser C
```

- **ConnectionDO**: One per user. Owns the WebSocket, stores metadata, handles events.
- **RoomDO**: One per room. No WebSockets — just a member list and broadcast logic via RPC.
- **Hibernation**: Durable Objects hibernate when idle. Verani automatically restores WebSocket connections, metadata, room membership, and event handlers on wake.

## Next Steps

- [Persisted State & Storage](./persisted-state.md) — Store data that survives hibernation and reconnection
- [API Reference](../api/server.md) — Full server API documentation
- [Typed Contracts](../api/typed.md) — Type-safe event definitions with runtime validation
- [Security](../security/authentication.md) — Authentication and authorization patterns
