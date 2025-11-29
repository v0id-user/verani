# Channels

🔓 **Public** - Configure custom WebSocket endpoint paths and multiple channels

## Custom WebSocket Paths

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
  }
});

// Register event handlers (socket.io-like)
multiChannelRoom.on("channel.join", (ctx, data) => {
  const { channel } = data;

  if (!ctx.meta.channels.includes(channel)) {
    ctx.meta.channels.push(channel);
    ctx.meta.subscribedChannels.add(channel);

    // Notify others in that channel using emit API
    ctx.actor.emit.to(channel).emit("channel.userJoined", {
      userId: ctx.meta.userId
    });
  }
});

multiChannelRoom.on("channel.leave", (ctx, data) => {
  const { channel } = data;
  const idx = ctx.meta.channels.indexOf(channel);

  if (idx !== -1) {
    ctx.meta.channels.splice(idx, 1);
    ctx.meta.subscribedChannels.delete(channel);

    // Notify others using emit API
    ctx.actor.emit.to(channel).emit("channel.userLeft", {
      userId: ctx.meta.userId
    });
  }
});

multiChannelRoom.on("channel.message", (ctx, data) => {
  const { channel, text } = data;

  // Verify user is in channel
  if (ctx.meta.subscribedChannels.has(channel)) {
    // Broadcast to channel using emit API
    ctx.actor.emit.to(channel).emit("chat.message", {
      channel,
      from: ctx.meta.userId,
      text
    });
  } else {
    ctx.emit.emit("error", {
      message: `Not subscribed to channel: ${channel}`
    });
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

## Related Examples

- [Basic Chat](./basic-chat.md) - Simple chat room
- [Presence](./presence.md) - Track online users
- [Authentication](./authentication.md) - Secure authentication

