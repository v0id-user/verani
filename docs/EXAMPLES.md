# Examples

Common usage patterns and recipes for Verani.

## Table of Contents

- [Basic Chat Room](#basic-chat-room)
- [User Presence](#user-presence)
- [Private Messages](#private-messages)
- [Multiple Channels](#multiple-channels)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Notifications Feed](#notifications-feed)
- [Collaborative Editing](#collaborative-editing)
- [Game Session](#game-session)

---

## Basic Chat Room

A simple chat room where all messages are broadcast to everyone.

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

## User Presence

Track who is online and notify on join/leave.

```typescript
import { defineRoom } from "verani";

export const presenceRoom = defineRoom({
  onConnect(ctx) {
    // Get current online users
    const onlineUsers = ctx.actor.getConnectedUserIds();

    // Send current list to new user
    ctx.ws.send(JSON.stringify({
      type: "presence.sync",
      data: { users: onlineUsers }
    }));

    // Notify others of new user
    ctx.actor.broadcast("default", {
      type: "presence.join",
      userId: ctx.meta.userId
    }, { except: ctx.ws });
  },

  onDisconnect(ctx) {
    // Only notify if this was the user's last session
    const remainingSessions = ctx.actor.getUserSessions(ctx.meta.userId);
    if (remainingSessions.length === 0) {
      ctx.actor.broadcast("default", {
        type: "presence.leave",
        userId: ctx.meta.userId
      });
    }
  }
});
```

**Client:**

```typescript
const onlineUsers = new Set();

client.on("presence.sync", ({ users }) => {
  onlineUsers.clear();
  users.forEach(u => onlineUsers.add(u));
  updateOnlineList(Array.from(onlineUsers));
});

client.on("presence.join", ({ userId }) => {
  onlineUsers.add(userId);
  updateOnlineList(Array.from(onlineUsers));
  showNotification(`${userId} came online`);
});

client.on("presence.leave", ({ userId }) => {
  onlineUsers.delete(userId);
  updateOnlineList(Array.from(onlineUsers));
});
```

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

## Authentication

Verify JWT tokens and extract user info.

```typescript
import { defineRoom, parseJWT } from "verani";

interface AuthMeta extends ConnectionMeta {
  username: string;
  role: "user" | "moderator" | "admin";
}

export const secureRoom = defineRoom<AuthMeta>({
  extractMeta(req) {
    // Get token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: No token provided");
    }

    const token = authHeader.substring(7);
    const payload = parseJWT(token);

    if (!payload || !payload.sub) {
      throw new Error("Unauthorized: Invalid token");
    }

    // Verify token expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("Unauthorized: Token expired");
    }

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: payload.name || payload.sub,
      role: payload.role || "user"
    };
  },

  onMessage(ctx, frame) {
    // Moderator-only actions
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
      // ... implementation
    }
  }
});
```

**Client:**

```typescript
const token = await getAuthToken(); // Your auth system

const client = new VeraniClient("wss://app.example.com/ws", {
  // Can't set headers in WebSocket constructor
  // So we'll send token as query param or in first message
});

// Alternative: Send in query param
const client = new VeraniClient(
  `wss://app.example.com/ws?token=${token}`
);

// Then extract in server:
// const token = url.searchParams.get("token");
```

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

Personal notification feed for each user.

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

  // Get all user's WebSockets and send notification
  const sockets = await stub.getWebSockets();
  sockets.forEach(ws => {
    ws.send(JSON.stringify({
      type: "notification",
      data: notification
    }));
  });
}
```

---

## Collaborative Editing

Real-time collaborative document editing.

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

For more examples, check the [GitHub repository](https://github.com/your-org/verani).

