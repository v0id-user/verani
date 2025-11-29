# Input Validation

**Never trust client input.** Always validate and sanitize.

## Message Type Validation

```typescript
export const validatedRoom = defineRoom({
  name: "validated-room",
  websocketPath: "/ws"
});

// Register event handlers for allowed message types (socket.io-like)
validatedRoom.on("chat.message", (ctx, data) => {
  // Process chat message...
});

validatedRoom.on("chat.typing", (ctx, data) => {
  // Process typing indicator...
});

validatedRoom.on("channel.join", (ctx, data) => {
  // Process channel join...
});

validatedRoom.on("channel.leave", (ctx, data) => {
  // Process channel leave...
});

// Unregistered event types will be ignored automatically
```

## Data Validation

```typescript
export const chatRoom = defineRoom({
  name: "chat",
  websocketPath: "/ws"
});

// Register event handler (socket.io-like)
chatRoom.on("chat.message", (ctx, data) => {
  const { text } = data;

  // Validate text exists and is a string
  if (!text || typeof text !== "string") {
    ctx.emit.emit("error", { message: "Invalid message format" });
    return;
  }

  // Validate length
  if (text.length > 5000) {
    ctx.emit.emit("error", { message: "Message too long (max 5000 chars)" });
    return;
  }

  // Sanitize (remove dangerous content)
  const sanitized = text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();

  // Broadcast sanitized message using emit API
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: sanitized
  });
});
```

## Using Validation Libraries

```typescript
// npm install zod
import { z } from "zod";

const ChatMessageSchema = z.object({
  text: z.string().min(1).max(5000),
  replyTo: z.string().uuid().optional()
});

export const zodRoom = defineRoom({
  name: "zod-chat",
  websocketPath: "/ws"
});

// Register event handler (socket.io-like)
zodRoom.on("chat.message", (ctx, data) => {
  // Validate with Zod
  const result = ChatMessageSchema.safeParse(data);

  if (!result.success) {
    ctx.emit.emit("error", {
      message: "Invalid message",
      errors: result.error.issues
    });
    return;
  }

  const { text, replyTo } = result.data;
  // Process validated data...

  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text,
    replyTo
  });
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Authorization](./authorization.md) - What users can do
- [Rate Limiting](./rate-limiting.md) - Preventing abuse
- [Security Checklist](./checklist.md) - Production security checklist

