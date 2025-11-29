# Examples

Common usage patterns and recipes for Verani.

## Authentication Note

Examples marked with:
- 🔓 **Public** - No authentication required (anyone can connect)
- 🔒 **Authenticated** - Requires token verification
- 🔐 **Authorized** - Requires authentication + role/permission checks

**For production apps**, always use authenticated examples. See [SECURITY.md](./SECURITY.md) for implementation details.

## Table of Contents

- [Basic Chat Room](#basic-chat-room) 🔓
- [Custom WebSocket Paths](#custom-websocket-paths) 🔓
- [User Presence](#user-presence) 🔓
- [Private Messages](#private-messages) 🔓
- [Multiple Channels](#multiple-channels) 🔓
- [Authentication (JWT)](#authentication) 🔒
- [Rate Limiting](#rate-limiting) 🔓
- [Notifications Feed](#notifications-feed) 🔒
- [Collaborative Editing](#collaborative-editing) 🔒
- [Game Session](#game-session) 🔓
- [Sending Messages via RPC](#sending-messages-via-rpc) 🔒

---

## Basic Chat Room

🔓 **Public** - No authentication (for demo purposes)

A simple chat room where all messages are broadcast to everyone.

**⚠️ Security Warning**: This example has no authentication. Users can set any `userId` they want. Use only for demos and prototypes. For production, see the [Authentication](#authentication) example.

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  name: "chat",

  onConnect(ctx) {
    // Announce new user
    ctx.actor.broadcast("default", {
      type: "system.message",
      text: `${ctx.meta.userId} joined the chat`
    });
  },

  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      // Broadcast message to everyone
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: ctx.meta.userId,
        text: frame.data.text,
        timestamp: Date.now()
      });
    }
  },

  onDisconnect(ctx) {
    // Announce user left
    ctx.actor.broadcast("default", {
      type: "system.message",
      text: `${ctx.meta.userId} left the chat`
    });
  }
});
```

**Client:**

```typescript
const client = new VeraniClient("wss://chat.example.com/ws?userId=alice");

client.on("chat.message", ({ from, text, timestamp }) => {
  addMessageToUI(from, text, timestamp);
});

client.on("system.message", ({ text }) => {
  addSystemMessage(text);
});

document.getElementById("sendBtn").onclick = () => {
  const text = document.getElementById("input").value;
  client.emit("chat.message", { text });
};
```

---

## Custom WebSocket Paths

🔓 **Public** - Configure custom WebSocket endpoint paths

By default, Verani accepts WebSocket connections at `/ws`. You can customize this per room:

**Important:** Verani **ONLY supports WebSocket connections**. All non-WebSocket requests are rejected with clear error messages:
- HTTP 426 (Upgrade Required) for non-WebSocket requests
- HTTP 404 for wrong paths with the correct path information

```typescript
import { defineRoom, createActorHandler } from "verani";

// Chat room at /chat
export const chatRoom = defineRoom({
  name: "chat",
  websocketPath: "/chat", // Custom path

  onConnect(ctx) {
    console.log(`User connected to /chat`);
  },

  onMessage(ctx, frame) {
    // Handle messages
  }
});

// Presence room at /presence
export const presenceRoom = defineRoom({
  name: "presence",
  websocketPath: "/presence", // Different path

  onConnect(ctx) {
    console.log(`User connected to /presence`);
  }
});

// Create handlers
const ChatRoom = createActorHandler(chatRoom);
const PresenceRoom = createActorHandler(presenceRoom);

export { ChatRoom, PresenceRoom };
```

**Worker routing:**

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route to chat room
    if (url.pathname.startsWith("/chat")) {
      const stub = ChatRoom.get("chat-instance");
      return stub.fetch(request);
    }

    // Route to presence room
    if (url.pathname.startsWith("/presence")) {
      const stub = PresenceRoom.get("presence-instance");
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

**Client:**

```typescript
// Connect to chat
const chatClient = new VeraniClient("wss://example.com/chat?userId=alice");

// Connect to presence
const presenceClient = new VeraniClient("wss://example.com/presence?userId=alice");

// Trying to connect with HTTP will get clear error:
// HTTP 426: "This endpoint only accepts WebSocket connections at /chat"

// Wrong path will get clear error:
// HTTP 404: "WebSocket endpoint is /chat, not /wrong-path"
```

---

## User Presence

Track who is online and notify on join/leave with consistent state management.

**Key Features:**
- Durable storage for consistent presence tracking
- Atomic transactions prevent race conditions
- Survives actor hibernation
- Tracks multiple devices per user

```typescript
import { defineRoom } from "verani";

interface StoredUserPresence {
  username: string;
  status: "online" | "away" | "busy";
  deviceCount: number;
  lastSeen: number;
}

export const presenceRoom = defineRoom({
  async onConnect(ctx) {
    // Use transactions for atomic updates
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const existing = await txn.get<StoredUserPresence>(storageKey);

      const isNewUser = !existing;
      const newDeviceCount = (existing?.deviceCount || 0) + 1;

      // Store presence atomically
      await txn.put(storageKey, {
        username: ctx.meta.userId,
        status: "online",
        deviceCount: newDeviceCount,
        lastSeen: Date.now()
      });

      // Load all users from storage (source of truth)
      const allUsers = await loadAllPresence(txn);

      // Send presence sync to new user
      ctx.ws.send(JSON.stringify({
        type: "presence.sync",
        data: {
          users: Array.from(allUsers.values()),
          totalUsers: allUsers.size
        }
      }));

      // Notify others
      if (isNewUser) {
        ctx.actor.broadcast("default", {
          type: "presence.online",
          userId: ctx.meta.userId,
          devices: newDeviceCount
        }, { except: ctx.ws });
      } else {
        ctx.actor.broadcast("default", {
          type: "presence.update",
          userId: ctx.meta.userId,
          devices: newDeviceCount
        }, { except: ctx.ws });
      }
    });
  },

  async onDisconnect(ctx) {
    // Atomic disconnect handling
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const user = await txn.get<StoredUserPresence>(storageKey);

      if (!user) return;

      const newDeviceCount = Math.max(0, user.deviceCount - 1);

      if (newDeviceCount === 0) {
        // Last device - remove from storage
        await txn.delete(storageKey);

        ctx.actor.broadcast("default", {
          type: "presence.offline",
          userId: ctx.meta.userId
        });
      } else {
        // Update device count
        await txn.put(storageKey, {
          ...user,
          deviceCount: newDeviceCount,
          lastSeen: Date.now()
        });

        ctx.actor.broadcast("default", {
          type: "presence.update",
          userId: ctx.meta.userId,
          devices: newDeviceCount
        });
      }
    });
  },

  async onHibernationRestore(actor) {
    // Reconcile storage with restored sessions after hibernation
    const allUsers = await loadAllPresence(actor.getStorage());

    await actor.getStorage().transaction(async (txn) => {
      // Count actual connected devices
      const actualDeviceCounts = new Map<string, number>();
      for (const session of actor.sessions.values()) {
        const count = actualDeviceCounts.get(session.meta.userId) || 0;
        actualDeviceCounts.set(session.meta.userId, count + 1);
      }

      // Sync storage with reality
      for (const [userId, storedUser] of allUsers.entries()) {
        const actualCount = actualDeviceCounts.get(userId) || 0;

        if (actualCount === 0) {
          // Stale entry - remove
          await txn.delete(`presence:user:${userId}`);
        } else if (actualCount !== storedUser.deviceCount) {
          // Sync count
          await txn.put(`presence:user:${userId}`, {
            ...storedUser,
            deviceCount: actualCount,
            lastSeen: Date.now()
          });
        }
      }
    });

    // Send sync to all restored sessions
    const reconciledUsers = await loadAllPresence(actor.getStorage());
    const syncMessage = JSON.stringify({
      type: "presence.sync",
      data: {
        users: Array.from(reconciledUsers.values()),
        totalUsers: reconciledUsers.size
      }
    });

    for (const session of actor.sessions.values()) {
      session.ws.send(syncMessage);
    }
  }
});

// Helper to load all presence from storage or transaction
async function loadAllPresence(
  storageOrTxn: DurableObjectStorage | DurableObjectTransaction
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map();
  const list = await storageOrTxn.list<StoredUserPresence>({
    prefix: "presence:user:"
  });

  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
  }

  return users;
}
```

**Client:**

```typescript
const onlineUsers = new Map();

// Presence sync is always authoritative (from storage)
client.on("presence.sync", ({ users, totalUsers }) => {
  onlineUsers.clear();
  users.forEach(u => onlineUsers.set(u.userId, u));
  updateOnlineList(Array.from(onlineUsers.values()));
});

client.on("presence.online", ({ userId, devices }) => {
  onlineUsers.set(userId, { userId, devices, status: "online" });
  updateOnlineList(Array.from(onlineUsers.values()));
  showNotification(`${userId} came online`);
});

client.on("presence.offline", ({ userId }) => {
  onlineUsers.delete(userId);
  updateOnlineList(Array.from(onlineUsers.values()));
});

client.on("presence.update", ({ userId, devices }) => {
  const user = onlineUsers.get(userId);
  if (user) {
    user.devices = devices;
    updateOnlineList(Array.from(onlineUsers.values()));
  }
});
```

**Why Transactions?**

Without transactions, rapid connect/disconnect events can cause race conditions:

```typescript
// ❌ Race condition - device count can be wrong
const user = await storage.get(key);
const newCount = user.deviceCount + 1;
await storage.put(key, { ...user, deviceCount: newCount });
// Another connection could have changed deviceCount between get and put!

// ✅ Atomic - always consistent
await storage.transaction(async (txn) => {
  const user = await txn.get(key);
  await txn.put(key, { ...user, deviceCount: user.deviceCount + 1 });
});
```

**Hibernation Behavior:**

When an actor hibernates and wakes up:
1. Sessions are restored from WebSocket attachments
2. `onHibernationRestore` reconciles storage with actual connections
3. Stale entries are cleaned up
4. All clients receive a presence sync with current state

See the full example in `examples/presence-room.ts`.

---

## Private Messages

Send messages to specific users only.

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  onMessage(ctx, frame) {
    // Handle direct messages
    if (frame.type === "dm.send") {
      const { toUserId, text } = frame.data;

      // Send to recipient
      const sent = ctx.actor.sendToUser(toUserId, "dm.receive", {
        from: ctx.meta.userId,
        text,
        timestamp: Date.now()
      });

      // Confirm delivery to sender
      ctx.ws.send(JSON.stringify({
        type: "dm.sent",
        data: {
          toUserId,
          delivered: sent > 0
        }
      }));
    }
  }
});
```

**Client:**

```typescript
// Send DM
function sendDM(toUserId, text) {
  client.emit("dm.send", { toUserId, text });
}

// Receive DM
client.on("dm.receive", ({ from, text, timestamp }) => {
  showPrivateMessage(from, text);
  playNotificationSound();
});

// Confirmation
client.on("dm.sent", ({ toUserId, delivered }) => {
  if (!delivered) {
    showError(`${toUserId} is offline`);
  }
});
```

---

## Multiple Channels

Let users join different channels within the same room.

```typescript
import { defineRoom } from "verani";

interface ChannelMeta extends ConnectionMeta {
  subscribedChannels: Set<string>;
}

export const multiChannelRoom = defineRoom<ChannelMeta>({
  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") || "anonymous",
      clientId: crypto.randomUUID(),
      channels: ["lobby"], // Start in lobby
      subscribedChannels: new Set(["lobby"])
    };
  },

  onMessage(ctx, frame) {
    // Join a channel
    if (frame.type === "channel.join") {
      const { channel } = frame.data;

      if (!ctx.meta.channels.includes(channel)) {
        ctx.meta.channels.push(channel);
        ctx.meta.subscribedChannels.add(channel);

        // Notify others in that channel
        ctx.actor.broadcast(channel, {
          type: "channel.userJoined",
          userId: ctx.meta.userId
        }, { except: ctx.ws });
      }
    }

    // Leave a channel
    if (frame.type === "channel.leave") {
      const { channel } = frame.data;
      const idx = ctx.meta.channels.indexOf(channel);

      if (idx !== -1) {
        ctx.meta.channels.splice(idx, 1);
        ctx.meta.subscribedChannels.delete(channel);

        ctx.actor.broadcast(channel, {
          type: "channel.userLeft",
          userId: ctx.meta.userId
        });
      }
    }

    // Send message to specific channel
    if (frame.type === "channel.message") {
      const { channel, text } = frame.data;

      // Verify user is in channel
      if (ctx.meta.subscribedChannels.has(channel)) {
        ctx.actor.broadcast(channel, {
          type: "chat.message",
          channel,
          from: ctx.meta.userId,
          text
        });
      }
    }
  }
});
```

**Client:**

```typescript
// Join a channel
client.emit("channel.join", { channel: "general" });

// Send to specific channel
function sendToChannel(channel, text) {
  client.emit("channel.message", { channel, text });
}

// Receive channel messages
client.on("chat.message", ({ channel, from, text }) => {
  addMessageToChannel(channel, from, text);
});
```

---

## Authentication (JWT)

🔒 **Authenticated** - JWT token verification required

This example shows how to properly verify user identity using JWT tokens.

```typescript
import { defineRoom } from "verani";
// npm install @tsndr/cloudflare-worker-jwt
import jwt from "@tsndr/cloudflare-worker-jwt";

interface AuthMeta extends ConnectionMeta {
  username: string;
  role: "user" | "moderator" | "admin";
}

export const secureRoom = defineRoom<AuthMeta>({
  async extractMeta(req) {
    // Get token from query parameter (or Authorization header)
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    // Verify JWT signature and expiration
    // Replace SECRET_KEY with your actual secret from environment
    const isValid = await jwt.verify(token, SECRET_KEY);

    if (!isValid) {
      throw new Error("Unauthorized: Invalid token");
    }

    // Decode verified token
    const payload = jwt.decode(token);

    // Validate required claims
    if (!payload.sub) {
      throw new Error("Unauthorized: Missing user ID");
    }

    // Extract verified user data
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: payload.name || payload.sub,
      role: payload.role || "user"
    };
  },

  onConnect(ctx) {
    // ctx.meta.userId is now VERIFIED and TRUSTED
    console.log(`Verified user ${ctx.meta.username} connected`);
  },

  onMessage(ctx, frame) {
    // Authorization check: Moderator-only actions
    if (frame.type === "mod.kick") {
      if (ctx.meta.role !== "moderator" && ctx.meta.role !== "admin") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Insufficient permissions" }
        }));
        return;
      }

      // Perform kick action
      const { targetUserId } = frame.data;
      // Close target user's connections
      const sessions = ctx.actor.getUserSessions(targetUserId);
      sessions.forEach(ws => ws.close(1008, "Kicked by moderator"));

      // Notify room
      ctx.actor.broadcast("default", {
        type: "user.kicked",
        userId: targetUserId,
        by: ctx.meta.userId
      });
    }
  },

  onError(error, ctx) {
    console.error(`Auth error for ${ctx.meta.userId}:`, error);
    // Don't expose error details to client
    ctx.ws.send(JSON.stringify({
      type: "error",
      data: { message: "An error occurred" }
    }));
  }
});
```

**Client:**

```typescript
// Step 1: Get JWT token from your auth service
async function login(username, password) {
  const response = await fetch("https://your-api.com/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const { token } = await response.json();
  return token;
}

// Step 2: Connect with verified token
const token = await login("alice", "password123");

const client = new VeraniClient(
  `wss://app.example.com/ws?token=${token}`
);

// Step 3: Handle auth errors
client.onClose((event) => {
  if (event.reason === "Unauthorized") {
    // Token invalid or expired - redirect to login
    window.location.href = "/login";
  }
});

client.on("error", (error) => {
  console.error("Connection error:", error);
});
```

**Important Notes:**

1. **Never** put tokens in localStorage if they contain sensitive data
2. Use short-lived tokens (15-60 minutes)
3. Implement token refresh mechanism
4. Always use WSS (not WS) in production
5. Consider using HttpOnly cookies instead of query params for better security

**See [SECURITY.md](./SECURITY.md) for comprehensive authentication guide.**

---

## Rate Limiting

Limit messages per user to prevent spam.

```typescript
import { defineRoom } from "verani";

interface RateLimitMeta extends ConnectionMeta {
  messageCount: number;
  lastReset: number;
}

export const rateLimitedRoom = defineRoom<RateLimitMeta>({
  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") || "anonymous",
      clientId: crypto.randomUUID(),
      channels: ["default"],
      messageCount: 0,
      lastReset: Date.now()
    };
  },

  onMessage(ctx, frame) {
    const now = Date.now();
    const meta = ctx.meta;

    // Reset counter every minute
    if (now - meta.lastReset > 60000) {
      meta.messageCount = 0;
      meta.lastReset = now;
    }

    // Check rate limit (10 messages per minute)
    if (meta.messageCount >= 10) {
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: {
          message: "Rate limit exceeded. Please slow down.",
          retryAfter: 60 - Math.floor((now - meta.lastReset) / 1000)
        }
      }));
      return;
    }

    // Increment counter
    meta.messageCount++;

    // Process message normally
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

---

## Notifications Feed

🔒 **Authenticated** - Requires user verification

Personal notification feed for each user. Each user gets their own Actor instance.

```typescript
import { defineRoom } from "verani";

// Route by user ID: nameFromRequest returns `notifications:${userId}`
export const notificationsRoom = defineRoom({
  extractMeta(req) {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw new Error("userId required");
    }

    return {
      userId,
      clientId: crypto.randomUUID(),
      channels: ["notifications"]
    };
  },

  onConnect(ctx) {
    // Send recent notifications from storage (if implemented)
    // const recent = await ctx.actor.storage.get("recent");
    // ctx.ws.send(JSON.stringify({ type: "sync", data: recent }));
  }
});

// External service pushes notifications
export async function pushNotification(
  userId: string,
  notification: any,
  env: Env
) {
  // Get the user's notification Actor
  const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
  const stub = env.NOTIFICATIONS.get(id);

  // Send notification via RPC
  await stub.sendToUser(userId, "default", {
    type: "notification",
    data: notification
  });
}
```

---

## Collaborative Editing

🔒 **Authenticated** - Requires user verification + document access check

Real-time collaborative document editing with authorization.

```typescript
import { defineRoom } from "verani";

interface EditMeta extends ConnectionMeta {
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
}

export const editorRoom = defineRoom<EditMeta>({
  onMessage(ctx, frame) {
    // Broadcast text changes
    if (frame.type === "doc.change") {
      const { operation, position, content } = frame.data;

      ctx.actor.broadcast("default", {
        type: "doc.change",
        from: ctx.meta.userId,
        operation,
        position,
        content,
        timestamp: Date.now()
      }, { except: ctx.ws });
    }

    // Broadcast cursor position
    if (frame.type === "cursor.move") {
      ctx.meta.cursor = frame.data.cursor;

      ctx.actor.broadcast("default", {
        type: "cursor.update",
        userId: ctx.meta.userId,
        cursor: frame.data.cursor
      }, { except: ctx.ws });
    }

    // Request current document state
    if (frame.type === "doc.sync") {
      // In production, load from Durable Object storage
      // For now, just notify other clients
      ctx.actor.broadcast("default", {
        type: "sync.request",
        requesterId: ctx.meta.userId
      }, { except: ctx.ws });
    }
  },

  onDisconnect(ctx) {
    // Remove user's cursor
    ctx.actor.broadcast("default", {
      type: "cursor.remove",
      userId: ctx.meta.userId
    });
  }
});
```

---

## Game Session

Real-time multiplayer game state synchronization.

```typescript
import { defineRoom } from "verani";

interface GameMeta extends ConnectionMeta {
  playerColor: string;
  ready: boolean;
}

export const gameRoom = defineRoom<GameMeta>({
  extractMeta(req) {
    const url = new URL(req.url);
    const colors = ["red", "blue", "green", "yellow"];

    return {
      userId: url.searchParams.get("userId") || crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      channels: ["game"],
      playerColor: colors[Math.floor(Math.random() * colors.length)],
      ready: false
    };
  },

  onConnect(ctx) {
    const playerCount = ctx.actor.getSessionCount();

    // Send current game state to new player
    ctx.ws.send(JSON.stringify({
      type: "game.joined",
      data: {
        yourColor: ctx.meta.playerColor,
        playerCount
      }
    }));

    // Notify others
    ctx.actor.broadcast("game", {
      type: "player.joined",
      userId: ctx.meta.userId,
      color: ctx.meta.playerColor
    }, { except: ctx.ws });
  },

  onMessage(ctx, frame) {
    // Player ready
    if (frame.type === "player.ready") {
      ctx.meta.ready = true;

      ctx.actor.broadcast("game", {
        type: "player.ready",
        userId: ctx.meta.userId
      });

      // Check if all players ready
      const allReady = Array.from(ctx.actor.sessions.values())
        .every(s => s.meta.ready);

      if (allReady) {
        ctx.actor.broadcast("game", {
          type: "game.start"
        });
      }
    }

    // Game action
    if (frame.type === "game.action") {
      ctx.actor.broadcast("game", {
        type: "game.action",
        userId: ctx.meta.userId,
        action: frame.data.action,
        timestamp: Date.now()
      }, { except: ctx.ws });
    }
  }
});
```

---

## Tips & Best Practices

### 1. **Always validate client input**

```typescript
onMessage(ctx, frame) {
  if (frame.type === "chat.message") {
    const { text } = frame.data;

    // Validate
    if (!text || typeof text !== "string") {
      return;
    }

    if (text.length > 500) {
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: { message: "Message too long" }
      }));
      return;
    }

    // Process...
  }
}
```

### 2. **Use TypeScript for metadata**

```typescript
interface MyMeta extends ConnectionMeta {
  username: string;
  level: number;
}

const room = defineRoom<MyMeta>({ /* ... */ });
```

---

## Sending Messages via RPC

🔒 **Authenticated** - Send messages to users from HTTP endpoints or other Workers

Since Actors are Durable Objects, you can call their methods remotely using RPC. This is perfect for sending notifications from REST APIs, webhooks, or scheduled tasks.

### Basic RPC Example: Send Notification from HTTP Endpoint

**Room Definition:**

```typescript
import { defineRoom } from "verani";

export const notificationsRoom = defineRoom({
  name: "notifications",
  websocketPath: "/notifications",

  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected to notifications`);
  },

  onMessage(ctx, frame) {
    // Handle client messages if needed
  }
});
```

**Worker with RPC Endpoint:**

```typescript
import { createActorHandler } from "verani";
import { notificationsRoom } from "./rooms/notifications";

const NotificationsRoom = createActorHandler(notificationsRoom);
export { NotificationsRoom };

interface Env {
  NOTIFICATIONS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket connections
    if (url.pathname.startsWith("/notifications")) {
      const id = env.NOTIFICATIONS.idFromName("notifications");
      const stub = env.NOTIFICATIONS.get(id);
      return stub.fetch(request);
    }

    // HTTP endpoint to send notifications via RPC
    if (url.pathname === "/api/send-notification" && request.method === "POST") {
      // Verify authentication (simplified - use proper auth in production)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }

      const { userId, message, type = "info" } = await request.json();

      // Get Actor stub
      const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
      const stub = env.NOTIFICATIONS.get(id);

      // Send notification via RPC
      const sentCount = await stub.sendToUser(userId, "default", {
        type: "notification",
        notificationType: type,
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

**Usage:**

```bash
# Send notification via HTTP
curl -X POST https://your-worker.dev/api/send-notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "message": "You have a new message",
    "type": "info"
  }'
```

### Query Actor State via RPC

Get real-time statistics about connected users:

```typescript
// In your Worker fetch handler
if (url.pathname === "/api/stats") {
  const id = env.NOTIFICATIONS.idFromName("notifications");
  const stub = env.NOTIFICATIONS.get(id);

  // Query actor state via RPC
  const [count, userIds] = await Promise.all([
    stub.getSessionCount(),
    stub.getConnectedUserIds()
  ]);

  return Response.json({
    onlineUsers: count,
    userIds,
    timestamp: Date.now()
  });
}
```

### Broadcast from External Event

Send announcements to all users in a channel:

```typescript
// Webhook handler for external events
if (url.pathname === "/webhook/announcement" && request.method === "POST") {
  const { announcement, channel = "default", targetUsers } = await request.json();

  const id = env.CHAT.idFromName("chat-room");
  const stub = env.CHAT.get(id);

  // Broadcast via RPC with optional user filtering
  const opts = targetUsers ? { userIds: targetUsers } : undefined;
  const sentCount = await stub.broadcast(channel, {
    type: "announcement",
    text: announcement,
    timestamp: Date.now()
  }, opts);

  return Response.json({
    success: true,
    sentTo: sentCount,
    message: `Announcement sent to ${sentCount} connection(s)`
  });
}
```

### Scheduled Notifications

Send notifications from scheduled tasks (Cron Triggers):

```typescript
// In wrangler.jsonc, add:
// "triggers": { "crons": ["0 9 * * *"] }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ... existing fetch handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Get list of users who should receive daily digest
    const usersToNotify = await getUsersForDailyDigest();

    // Send to each user's notification Actor
    for (const userId of usersToNotify) {
      const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
      const stub = env.NOTIFICATIONS.get(id);

      await stub.sendToUser(userId, "default", {
        type: "daily-digest",
        date: new Date().toISOString(),
        summary: await getDailySummary(userId)
      });
    }
  }
};
```

### RPC from Another Actor

Call Actor methods from other Actors:

```typescript
// In one Actor's lifecycle hook
onMessage(ctx, frame) {
  if (frame.type === "cross-room-message") {
    const { targetRoom, targetUser, message } = frame.data;

    // Get another Actor's stub
    const targetId = env.OTHER_ROOM.idFromName(targetRoom);
    const targetStub = env.OTHER_ROOM.get(targetId);

    // Send message via RPC
    targetStub.sendToUser(targetUser, "default", {
      type: "cross-room",
      from: ctx.meta.userId,
      message
    });
  }
}
```

### Key Points

1. **Always use `await`**: RPC methods return Promises even if the underlying method is synchronous
2. **Use `RpcBroadcastOptions`**: For broadcast options, use `RpcBroadcastOptions` (excludes `except` WebSocket option)
3. **Actor ID consistency**: Use the same `idFromName()` value for WebSocket connections and RPC calls
4. **Error handling**: RPC calls can fail - wrap in try/catch
5. **Performance**: RPC calls have network overhead - batch operations when possible

### Error Handling

```typescript
try {
  const sentCount = await stub.sendToUser(userId, "default", data);
  console.log(`Sent to ${sentCount} sessions`);
} catch (error) {
  console.error("RPC call failed:", error);
  // Handle error (retry, log, etc.)
}
```

---

### 3. **Handle errors gracefully**

```typescript
onError(error, ctx) {
  console.error(`Error for ${ctx.meta.userId}:`, error);

  // Don't expose error details to client
  ctx.ws.send(JSON.stringify({
    type: "error",
    data: { message: "Something went wrong" }
  }));
}
```

### 4. **Monitor connection count**

```typescript
onConnect(ctx) {
  const count = ctx.actor.getSessionCount();

  if (count > 1000) {
    console.warn(`High connection count: ${count}`);
  }
}
```

### 5. **Clean up on disconnect**

```typescript
onDisconnect(ctx) {
  // Cancel any pending operations for this user
  // Remove from in-memory data structures
  // Update presence
}
```

---

For more examples, check the [GitHub repository](https://github.com/v0id-user/verani).

