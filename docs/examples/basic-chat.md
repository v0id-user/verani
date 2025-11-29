# Basic Chat Room

🔓 **Public** - No authentication (for demo purposes)

A simple chat room where all messages are broadcast to everyone.

**⚠️ Security Warning**: This example has no authentication. Users can set any `userId` they want. Use only for demos and prototypes. For production, see the [Authentication](./authentication.md) example.

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

## Related Examples

- [Channels](./channels.md) - Multiple channels within a room
- [Authentication](./authentication.md) - Secure authentication
- [Presence](./presence.md) - Track online users

