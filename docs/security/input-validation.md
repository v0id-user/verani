# Input Validation

**Never trust client input.** Always validate and sanitize.

## Message Type Validation

```typescript
const ALLOWED_TYPES = new Set([
  "chat.message",
  "chat.typing",
  "channel.join",
  "channel.leave"
]);

export const validatedRoom = defineRoom({
  onMessage(ctx, frame) {
    // Validate message type
    if (!ALLOWED_TYPES.has(frame.type)) {
      console.warn(`Invalid message type: ${frame.type}`);
      return;
    }

    // Process...
  }
});
```

## Data Validation

```typescript
export const chatRoom = defineRoom({
  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      const { text } = frame.data;

      // Validate text exists and is a string
      if (!text || typeof text !== "string") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Invalid message format" }
        }));
        return;
      }

      // Validate length
      if (text.length > 5000) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Message too long (max 5000 chars)" }
        }));
        return;
      }

      // Sanitize (remove dangerous content)
      const sanitized = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .trim();

      // Broadcast sanitized message
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: ctx.meta.userId,
        text: sanitized
      });
    }
  }
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
  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      // Validate with Zod
      const result = ChatMessageSchema.safeParse(frame.data);

      if (!result.success) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: {
            message: "Invalid message",
            errors: result.error.issues
          }
        }));
        return;
      }

      const { text, replyTo } = result.data;
      // Process validated data...
    }
  }
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Authorization](./authorization.md) - What users can do
- [Rate Limiting](./rate-limiting.md) - Preventing abuse
- [Security Checklist](./checklist.md) - Production security checklist

