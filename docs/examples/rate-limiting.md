# Rate Limiting

🔓 **Public** - Limit messages per user to prevent spam.

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
  }
});

// Rate limiting middleware using wildcard handler (socket.io-like)
rateLimitedRoom.on("*", (ctx, data) => {
  const now = Date.now();
  const meta = ctx.meta;

  // Reset counter every minute
  if (now - meta.lastReset > 60000) {
    meta.messageCount = 0;
    meta.lastReset = now;
  }

  // Check rate limit (10 messages per minute)
  if (meta.messageCount >= 10) {
    ctx.emit.emit("error", {
      message: "Rate limit exceeded. Please slow down.",
      retryAfter: 60 - Math.floor((now - meta.lastReset) / 1000)
    });
    return;
  }

  // Increment counter
  meta.messageCount++;
});

// Register event handlers for specific events
rateLimitedRoom.on("chat.message", (ctx, data) => {
  // Rate limit check already done by wildcard handler
  // Process message using emit API
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

## Related Examples

- [Basic Chat](./basic-chat.md) - Simple chat room
- [Authentication](./authentication.md) - Secure authentication
- [Security Guide - Rate Limiting](../security/rate-limiting.md) - Advanced rate limiting strategies

