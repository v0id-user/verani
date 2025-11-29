# Quick Start Guide

A step-by-step guide to building your first Verani application.

## Step 1: Create Your First Room

Create a file `src/rooms/chat.ts`:

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  name: "chat",
  websocketPath: "/ws", // Optional: WebSocket path (defaults to "/ws")

  // Called when a user connects
  onConnect(ctx) {
    const { userId, clientId } = ctx.meta;
    console.log(`User ${userId} connected (client: ${clientId})`);

    // Notify others in the room
    ctx.actor.broadcast("default", {
      type: "user.joined",
      userId
    }, {
      except: ctx.ws // Don't send to the user who just joined
    });
  },

  // Called when a user sends a message
  onMessage(ctx, frame) {
    const { userId } = ctx.meta;

    // Handle chat messages
    if (frame.type === "chat.message") {
      const { text } = frame.data;

      // Broadcast to everyone in the room
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: userId,
        text,
        timestamp: Date.now()
      });
    }

    // Handle typing indicator
    if (frame.type === "chat.typing") {
      ctx.actor.broadcast("default", {
        type: "chat.typing",
        from: userId
      }, {
        except: ctx.ws // Don't echo back to sender
      });
    }
  },

  // Called when a user disconnects
  onDisconnect(ctx) {
    const { userId } = ctx.meta;
    console.log(`User ${userId} disconnected`);

    // Notify others
    ctx.actor.broadcast("default", {
      type: "user.left",
      userId
    });
  },

  // Optional: handle errors
  onError(error, ctx) {
    console.error(`Error for user ${ctx.meta.userId}:`, error);
  }
});
```

## Step 2: Export the Durable Object Class

Update your `src/index.ts`:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

// Create the Durable Object class
const ChatRoom = createActorHandler(chatRoom);

// Export it - name MUST match wrangler.jsonc class_name
export { ChatRoom };

// Define environment bindings
interface Env {
  CHAT: DurableObjectNamespace;
}

// Export fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket connections to the Durable Object
    if (url.pathname.startsWith("/ws")) {
      // Get or create a Durable Object instance using the class's static get() method
      const stub = ChatRoom.get("chat-room");
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

**Important**: The export name `ChatRoom` MUST match the `class_name` in your Wrangler configuration.

## Step 3: Calling Actor Methods via RPC

Since Actors are Durable Objects, you can call their methods remotely using RPC (Remote Procedure Calls). This is useful when you want to send messages to users from HTTP endpoints or other Workers.

### Understanding RPC vs Direct Methods

- **Inside lifecycle hooks** (`onConnect`, `onMessage`, etc.): Use `ctx.actor.method()` directly
- **From Workers or other Actors**: Use RPC via the stub: `await stub.method()`

### Example: Sending Notifications from an HTTP Endpoint

Update your `src/index.ts` to add an HTTP endpoint that sends messages via RPC:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

interface Env {
  // No namespace binding needed - use ChatRoom.get() directly
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket connections to the Durable Object
    if (url.pathname.startsWith("/ws")) {
      // Get Actor stub using the class's static get() method
      const stub = ChatRoom.get("chat-room");
      return stub.fetch(request);
    }

    // NEW: HTTP endpoint to send notifications via RPC
    if (url.pathname === "/api/notify" && request.method === "POST") {
      const { userId, message } = await request.json();

      // Get the Actor stub using the class's static get() method
      const stub = ChatRoom.get("chat-room");

      // Call RPC method - note: returns Promise even though method is sync
      const sentCount = await stub.sendToUser(userId, "default", {
        type: "notification",
        message,
        timestamp: Date.now()
      });

      return Response.json({
        success: true,
        sentTo: sentCount,
        message: `Notification sent to ${sentCount} session(s)`
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

### Available RPC Methods

The Actor stub exposes these methods for remote calls:

- `sendToUser(userId, channel, data?)` - Send message to a specific user
- `broadcast(channel, data, opts?)` - Broadcast to channel (use `RpcBroadcastOptions`)
- `getSessionCount()` - Get number of active connections
- `getConnectedUserIds()` - Get list of connected user IDs
- `cleanupStaleSessions()` - Remove stale connections

**Important Notes:**
- RPC methods always return `Promise<T>` even if the underlying method is synchronous
- Use `RpcBroadcastOptions` for broadcast options (excludes `except` WebSocket option)
- Methods that return non-serializable types (like `getUserSessions()`, `getStorage()`) are not available via RPC

### Complete RPC Example

```typescript
// In your Worker fetch handler
// Get Actor stub using the class's static get() method
const stub = ChatRoom.get("chat-room");

// Send to specific user
await stub.sendToUser("alice", "notifications", {
  type: "alert",
  text: "You have a new message"
});

// Broadcast to channel with filters
await stub.broadcast("general", {
  type: "announcement",
  text: "Server maintenance in 5 minutes"
}, {
  userIds: ["admin", "moderator"] // Only send to these users
});

// Query actor state
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
console.log(`${count} users online: ${userIds.join(", ")}`);

// Clean up stale sessions
const cleaned = await stub.cleanupStaleSessions();
console.log(`Cleaned up ${cleaned} stale sessions`);
```

For more RPC details, see the [RPC Guide](../guides/rpc.md).

## Step 4: Configure Wrangler

Update your `wrangler.jsonc`:

```jsonc
{
  "name": "my-verani-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // MUST match export in src/index.ts
        "name": "CHAT"              // Binding name (env.ChatRoom)
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

**Two-way relationship** - these must align:
1. Export in `src/index.ts`: `export { ChatRoom }`
2. Class name in config: `"class_name": "ChatRoom"`

**Note**: You access the Actor via `ChatRoom.get(id)` - no namespace binding needed in your code!

For detailed configuration information, see the [Configuration Guide](../guides/configuration.md).

## Step 5: Deploy

With npm:
```bash
npx wrangler deploy
```

With Bun:
```bash
bunx wrangler deploy
```

Your WebSocket endpoint will be available at:
```
wss://my-verani-app.your-subdomain.workers.dev/ws
```

For more deployment details, see the [Deployment Guide](../guides/deployment.md).

## Step 6: Build a Client

Create an HTML file with your client code:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Verani Chat</title>
  <script type="module">
    import { VeraniClient } from 'https://esm.sh/verani';

    // Connect to your Worker
    const client = new VeraniClient(
      'wss://my-verani-app.your-subdomain.workers.dev/ws?userId=alice'
    );

    // Listen for connection state
    client.onOpen(() => {
      console.log('Connected!');
      document.getElementById('status').textContent = 'Connected';
    });

    client.onStateChange((state) => {
      console.log('State:', state);
      document.getElementById('status').textContent = state;
    });

    // Listen for messages
    client.on('chat.message', (data) => {
      const { from, text, timestamp } = data;
      addMessage(from, text);
    });

    client.on('user.joined', (data) => {
      addSystemMessage(`${data.userId} joined`);
    });

    client.on('user.left', (data) => {
      addSystemMessage(`${data.userId} left`);
    });

    client.on('chat.typing', (data) => {
      showTyping(data.from);
    });

    // Send messages
    window.sendMessage = () => {
      const input = document.getElementById('messageInput');
      const text = input.value.trim();

      if (text) {
        client.emit('chat.message', { text });
        input.value = '';
      }
    };

    // Send typing indicator
    window.onTyping = () => {
      client.emit('chat.typing', {});
    };

    // Helper functions
    function addMessage(from, text) {
      const messages = document.getElementById('messages');
      const div = document.createElement('div');
      div.innerHTML = `<strong>${from}:</strong> ${text}`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function addSystemMessage(text) {
      const messages = document.getElementById('messages');
      const div = document.createElement('div');
      div.innerHTML = `<em>${text}</em>`;
      div.style.color = '#666';
      messages.appendChild(div);
    }

    function showTyping(userId) {
      // Implement typing indicator
      console.log(`${userId} is typing...`);
    }
  </script>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 50px auto; }
    #status { color: green; font-weight: bold; }
    #messages {
      border: 1px solid #ccc;
      height: 400px;
      overflow-y: auto;
      padding: 10px;
      margin: 20px 0;
    }
    #messageInput { width: 80%; padding: 10px; }
    button { padding: 10px 20px; }
  </style>
</head>
<body>
  <h1>Verani Chat</h1>
  <div>Status: <span id="status">Connecting...</span></div>

  <div id="messages"></div>

  <div>
    <input
      type="text"
      id="messageInput"
      placeholder="Type a message..."
      onkeyup="if(event.key==='Enter') sendMessage(); else onTyping();"
    />
    <button onclick="sendMessage()">Send</button>
  </div>
</body>
</html>
```

## Step 7: Test It

1. Open the HTML file in multiple browser tabs
2. Type messages in one tab
3. See them appear in all tabs in real-time!

**Note**: This example uses anonymous/unauthenticated connections where `userId` comes from the query parameter. For production apps, see the authentication section below.

## Authentication Setup (Production)

The example above uses **unauthenticated connections** where anyone can set any `userId`. For production, you should verify user identity.

### Quick Auth Example

Update your room to verify JWT tokens:

```typescript
// npm install @tsndr/cloudflare-worker-jwt
import jwt from "@tsndr/cloudflare-worker-jwt";
import { defineRoom } from "verani";

export const authenticatedRoom = defineRoom({
  // Verify token in extractMeta
  async extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Authentication required");
    }

    // Verify JWT (you'll need your secret key)
    const isValid = await jwt.verify(token, env.JWT_SECRET);

    if (!isValid) {
      throw new Error("Invalid token");
    }

    const payload = jwt.decode(token);

    return {
      userId: payload.sub,  // Now verified!
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: payload.name
    };
  },

  onConnect(ctx) {
    // ctx.meta.userId is now verified and trusted
    console.log(`Verified user ${ctx.meta.userId} connected`);
  },

  onMessage(ctx, frame) {
    // You can trust ctx.meta.userId here
    if (frame.type === "chat.message") {
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: ctx.meta.userId,
        text: frame.data.text
      });
    }
  }
});
```

### Client with Auth Token

```javascript
// Get token from your auth service
const token = await getAuthToken();

// Connect with verified token
const client = new VeraniClient(
  `wss://my-verani-app.workers.dev/ws?token=${token}`
);
```

**See [Security Guide - Authentication](../security/authentication.md) for comprehensive authentication guide.**

## Next Steps

### Configure Custom WebSocket Paths

By default, Verani accepts WebSocket connections at `/ws`. You can customize this per room:

```typescript
export const chatRoom = defineRoom({
  name: "chat",
  websocketPath: "/chat", // Custom path instead of /ws

  onConnect(ctx) {
    console.log("Connected!");
  }
});
```

**Important Notes:**
- Verani **ONLY supports WebSocket connections**
- Non-WebSocket requests return HTTP 426 (Upgrade Required) with an error message
- Requests to wrong paths return HTTP 404 with the correct path information
- Each room can have its own custom path

**Example with multiple rooms:**

```typescript
// Chat at /chat
const chatRoom = defineRoom({
  websocketPath: "/chat",
  // ...
});

// Presence at /presence
const presenceRoom = defineRoom({
  websocketPath: "/presence",
  // ...
});
```

### Add Custom Metadata

Extract user info from authentication tokens:

```typescript
export const chatRoom = defineRoom({
  // Custom metadata extraction
  extractMeta(req) {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const username = url.searchParams.get('username') || userId;

    return {
      userId,
      clientId: crypto.randomUUID(),
      channels: ['default'],
      username // Add custom fields!
    };
  },

  onConnect(ctx) {
    console.log(`${ctx.meta.username} joined!`);
  }
});
```

### Add Presence Tracking

Track active users:

```typescript
export const chatRoom = defineRoom({
  onConnect(ctx) {
    // Get all connected users
    const userIds = ctx.actor.getConnectedUserIds();

    // Send current user list to the new user
    ctx.ws.send(JSON.stringify({
      type: 'presence.sync',
      data: { users: userIds }
    }));
  }
});
```

### Add Authentication

Verify JWT tokens:

```typescript
import { parseJWT } from 'your-jwt-library';

export const chatRoom = defineRoom({
  extractMeta(req) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized');
    }

    const token = authHeader.substring(7);
    const payload = parseJWT(token);

    if (!payload) {
      throw new Error('Invalid token');
    }

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ['default'],
      username: payload.username
    };
  }
});
```

### Add Multiple Channels

Use channels for selective broadcasting:

```typescript
export const chatRoom = defineRoom({
  onMessage(ctx, frame) {
    // Join a specific channel
    if (frame.type === 'channel.join') {
      const { channel } = frame.data;
      if (!ctx.meta.channels.includes(channel)) {
        ctx.meta.channels.push(channel);
      }
    }

    // Send to specific channel
    if (frame.type === 'channel.message') {
      const { channel, text } = frame.data;
      ctx.actor.broadcast(channel, {
        type: 'chat.message',
        from: ctx.meta.userId,
        text
      });
    }
  }
});
```

### Use TypeScript for Better Types

Define custom metadata types:

```typescript
import type { ConnectionMeta } from 'verani';

interface ChatMeta extends ConnectionMeta {
  username: string;
  avatar?: string;
  role: 'user' | 'moderator' | 'admin';
}

export const chatRoom = defineRoom<ChatMeta>({
  extractMeta(req): ChatMeta {
    // ... extract custom metadata
    return {
      userId: 'alice',
      clientId: crypto.randomUUID(),
      channels: ['default'],
      username: 'Alice',
      role: 'user'
    };
  },

  onConnect(ctx) {
    // ctx.meta is now typed as ChatMeta!
    console.log(`${ctx.meta.username} (${ctx.meta.role}) joined`);
  }
});
```

## What's Next?

- **[Concepts - Architecture](../concepts/architecture.md)** - Understand the architecture and RPC concepts
- **[API Reference](../api/server.md)** - Complete API docs including RPC methods
- **[Examples](../examples/README.md)** - More usage patterns including RPC examples
- **[Security Guide](../security/authentication.md)** - Authentication and authorization
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions

Congratulations! You've built your first Verani application. 🎉

