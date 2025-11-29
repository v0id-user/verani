# Socket.io-like API

Verani provides a socket.io-like API for a familiar developer experience. This guide shows how to use event handlers and the emit API.

## Overview

Verani supports two patterns for handling messages:

1. **Event Handlers** (socket.io-like) - Recommended for new code
2. **onMessage Hook** (traditional) - Still supported for backward compatibility

Event handlers take priority when registered. Both can coexist.

## Basic Event Handlers

### Registering Handlers

```typescript
import { defineRoom } from "verani";

const room = defineRoom({
  name: "chat",
  websocketPath: "/ws"
});

// Register event handlers
room.on("chat.message", (ctx, data) => {
  // Broadcast to all in default channel
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});

room.on("user.typing", (ctx, data) => {
  // Broadcast typing indicator
  ctx.actor.emit.to("default").emit("user.typing", {
    userId: ctx.meta.userId,
    isTyping: data.isTyping
  });
});
```

### Handler Context

Event handlers receive:
- `ctx: MessageContext` - Full context with actor, websocket, metadata, and emit API
- `data: any` - The data from the message frame

```typescript
room.on("custom.event", (ctx, data) => {
  // Access context properties
  const { actor, ws, meta, emit } = ctx;
  
  console.log(`User ${meta.userId} sent event`);
  console.log(`Actor has ${actor.getSessionCount()} connections`);
  
  // Access frame if needed
  const eventType = ctx.frame.type;
  
  // Use emit API
  emit.emit("response", { received: true });
});
```

## Emit API

### Socket-level Emit (`ctx.emit`)

Emit to the current socket, a user, or a channel.

#### Emit to Current Socket

```typescript
onConnect(ctx) {
  // Send welcome message to this socket
  ctx.emit.emit("welcome", {
    message: "Connected!",
    userId: ctx.meta.userId
  });
}

room.on("ping", (ctx, data) => {
  // Respond to ping
  ctx.emit.emit("pong", { timestamp: Date.now() });
});
```

#### Emit to a User

```typescript
room.on("notification.update", (ctx, data) => {
  const userId = data.userId;
  if (!userId) {
    throw new Error("Missing userId");
  }
  
  // Send to specific user (all their sessions)
  ctx.emit.to(userId).emit("inbox_changed", {
    type: "inbox_changed",
    count: data.count
  });
});
```

#### Emit to a Channel

```typescript
room.on("channel.message", (ctx, data) => {
  const channel = data.channel || "default";
  
  // Broadcast to channel
  ctx.emit.to(channel).emit("message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

**Note:** When using `ctx.emit.to()`, if the target matches one of the current user's channels, it's treated as a channel. Otherwise, it's treated as a userId.

### Actor-level Emit (`ctx.actor.emit`)

Broadcast to channels from the actor level.

#### Broadcast to Default Channel

```typescript
room.on("announcement", (ctx, data) => {
  // Broadcast to all in default channel
  const sentCount = ctx.actor.emit.emit("announcement", {
    message: data.message,
    timestamp: Date.now()
  });
  
  console.log(`Sent to ${sentCount} connections`);
});
```

#### Broadcast to Specific Channel

```typescript
room.on("room.message", (ctx, data) => {
  const roomId = data.roomId;
  
  // Broadcast to specific room/channel
  ctx.actor.emit.to(roomId).emit("message", {
    from: ctx.meta.userId,
    text: data.text,
    roomId
  });
});
```

## Complete Example: Notification System

```typescript
import { defineRoom } from "verani";

interface NotificationMeta extends ConnectionMeta {
  username: string;
}

const notificationRoom = defineRoom<NotificationMeta>({
  name: "notifications",
  websocketPath: "/ws/notifications",
  
  extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    
    // Verify token and extract user info
    const user = verifyToken(token);
    
    return {
      userId: user.id,
      clientId: crypto.randomUUID(),
      channels: ["notifications"],
      username: user.username
    };
  },
  
  onConnect(ctx) {
    // Send welcome with current notification count
    ctx.emit.emit("welcome", {
      message: "Connected to notifications",
      userId: ctx.meta.userId
    });
  }
});

// Handle notification updates
notificationRoom.on("notification.update", (ctx, data) => {
  const userId = data.userId;
  if (!userId) {
    throw new Error("Missing userId");
  }
  
  // Send to specific user
  ctx.emit.to(userId).emit("inbox_changed", {
    type: "inbox_changed",
    count: data.count
  });
});

// Handle marking notifications as read
notificationRoom.on("notification.mark-read", (ctx, data) => {
  // Broadcast read status to all user's sessions
  ctx.emit.to(ctx.meta.userId).emit("notification.read", {
    notificationId: data.id,
    readAt: Date.now()
  });
});

// Handle broadcasting announcements
notificationRoom.on("admin.announcement", (ctx, data) => {
  // Only admins can broadcast
  if (ctx.meta.role !== "admin") {
    ctx.emit.emit("error", { message: "Unauthorized" });
    return;
  }
  
  // Broadcast to all in notifications channel
  ctx.actor.emit.to("notifications").emit("announcement", {
    message: data.message,
    from: ctx.meta.username,
    timestamp: Date.now()
  });
});
```

## Wildcard Handlers

Register a handler for all events:

```typescript
// Log all events
room.on("*", (ctx, data) => {
  console.log(`Event: ${ctx.frame.type}`, {
    userId: ctx.meta.userId,
    data
  });
});

// Rate limiting for all events
room.on("*", async (ctx, data) => {
  const userId = ctx.meta.userId;
  const rateLimitKey = `rate:${userId}`;
  
  const storage = ctx.actor.getStorage();
  const count = await storage.get<number>(rateLimitKey) || 0;
  
  if (count > 100) {
    ctx.emit.emit("error", { message: "Rate limit exceeded" });
    return;
  }
  
  await storage.put(rateLimitKey, count + 1);
});
```

## Removing Handlers

```typescript
// Define handler
const messageHandler = (ctx, data) => {
  // Handler logic
};

// Register
room.on("chat.message", messageHandler);

// Remove specific handler
room.off("chat.message", messageHandler);

// Remove all handlers for event
room.off("chat.message");
```

## Mixing Event Handlers and onMessage

You can use both patterns together. Event handlers take priority:

```typescript
const room = defineRoom({
  name: "chat",
  websocketPath: "/ws",
  
  // Event handlers take priority
  onMessage(ctx, frame) {
    // Fallback for unhandled events
    console.log("Unhandled event:", frame.type);
    ctx.emit.emit("error", {
      message: `Unknown event: ${frame.type}`
    });
  }
});

// Register handlers
room.on("chat.message", (ctx, data) => {
  // This will be called instead of onMessage
  ctx.actor.emit.to("default").emit("chat.message", data);
});

room.on("ping", (ctx, data) => {
  // This will be called instead of onMessage
  ctx.emit.emit("pong", { timestamp: Date.now() });
});

// If "unknown.event" is received, onMessage will be called
```

## Best Practices

### 1. Use Event Handlers for Clear Separation

```typescript
// ✅ Good: Clear event-based structure
room.on("user.join", handleUserJoin);
room.on("user.leave", handleUserLeave);
room.on("message.send", handleMessageSend);

// ❌ Avoid: Everything in onMessage
onMessage(ctx, frame) {
  if (frame.type === "user.join") { /* ... */ }
  else if (frame.type === "user.leave") { /* ... */ }
  else if (frame.type === "message.send") { /* ... */ }
}
```

### 2. Use Emit API for Consistency

```typescript
// ✅ Good: Using emit API
ctx.emit.to(userId).emit("notification", data);
ctx.actor.emit.to("default").emit("update", data);

// ❌ Less consistent: Mixing APIs
ctx.actor.sendToUser(userId, "default", data);
ctx.actor.broadcast("default", data);
```

### 3. Handle Errors Gracefully

```typescript
room.on("notification.update", (ctx, data) => {
  try {
    const userId = data.userId;
    if (!userId) {
      throw new Error("Missing userId");
    }
    
    ctx.emit.to(userId).emit("inbox_changed", data);
  } catch (error) {
    ctx.emit.emit("error", {
      message: error.message
    });
  }
});
```

### 4. Use TypeScript for Type Safety

```typescript
interface ChatMeta extends ConnectionMeta {
  username: string;
}

const room = defineRoom<ChatMeta>({
  // ...
});

room.on("chat.message", (ctx, data: { text: string }) => {
  // ctx.meta is typed as ChatMeta
  // data is typed as { text: string }
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.username, // TypeScript knows username exists
    text: data.text
  });
});
```

## Migration from onMessage

If you have existing code using `onMessage`, you can gradually migrate:

**Before:**
```typescript
onMessage(ctx, frame) {
  if (frame.type === "chat.message") {
    ctx.actor.broadcast("default", {
      type: "chat.message",
      from: ctx.meta.userId,
      text: frame.data.text
    });
  }
}
```

**After:**
```typescript
room.on("chat.message", (ctx, data) => {
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

Both work! Event handlers are just more organized and socket.io-like.

## Related Examples

- [Basic Chat](./basic-chat.md) - Simple chat with event handlers
- [Channels](./channels.md) - Multi-channel broadcasting
- [Presence](./presence.md) - User presence tracking
- [Authentication](./authentication.md) - Secure authentication

## API Reference

- [Server API](../api/server.md) - Complete API documentation
- [Event Handlers](../api/server.md#event-handlers-socketio-like-api) - Event handler details
- [Emit API](../api/server.md#emit-api) - Emit API reference

