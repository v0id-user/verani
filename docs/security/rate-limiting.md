# Rate Limiting

Prevent abuse by limiting message rates.

## Per-Connection Rate Limiting

```typescript
interface RateLimitMeta extends ConnectionMeta {
  messageCount: number;
  windowStart: number;
}

const RATE_LIMIT = {
  WINDOW_MS: 60000, // 1 minute
  MAX_MESSAGES: 30   // 30 messages per minute
};

export const rateLimitedRoom = defineRoom<RateLimitMeta>({
  name: "rate-limited",
  websocketPath: "/ws",

  async extractMeta(req) {
    // ... auth ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      messageCount: 0,
      windowStart: Date.now()
    };
  }
});

// Register event handlers (socket.io-like)
rateLimitedRoom.on("chat.message", (ctx, data) => {
  const now = Date.now();
  const meta = ctx.meta;

  // Reset window if expired
  if (now - meta.windowStart > RATE_LIMIT.WINDOW_MS) {
    meta.messageCount = 0;
    meta.windowStart = now;
  }

  // Increment and check limit
  meta.messageCount++;

  if (meta.messageCount > RATE_LIMIT.MAX_MESSAGES) {
    ctx.emit.emit("error", {
      message: "Rate limit exceeded",
      retryAfter: Math.ceil(
        (RATE_LIMIT.WINDOW_MS - (now - meta.windowStart)) / 1000
      )
    });
    return;
  }

  // Process message...
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

## Per-User Global Rate Limiting

Use Cloudflare KV or Durable Object storage:

```typescript
export const globalRateLimitRoom = defineRoom({
  name: "global-rate-limited",
  websocketPath: "/ws"
});

// Register event handlers (socket.io-like)
// Note: For KV access, you'll need to store env reference in the Actor state
// or pass it through extractMeta. This is a simplified example.
globalRateLimitRoom.on("chat.message", async (ctx, data) => {
  const userId = ctx.meta.userId;
  const key = `ratelimit:${userId}`;

  // Get current count from KV (requires env access - see configuration guide)
  // const current = await env.KV.get(key);
  // const count = current ? parseInt(current) : 0;

  // For this example, using a simplified in-memory approach
  // In production, use KV or Durable Object storage
  const storage = ctx.actor.getStorage();
  const current = await storage.get(key);
  const count = current ? parseInt(current as string) : 0;

  if (count >= 100) {
    ctx.emit.emit("error", { message: "Daily limit exceeded" });
    return;
  }

  // Increment with TTL (using Durable Object storage)
  await storage.put(key, (count + 1).toString(), {
    expirationTtl: 86400 // 24 hours
  });

  // Process message...
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Input Validation](./input-validation.md) - Validating user input
- [Vulnerabilities](./vulnerabilities.md) - Common security issues
- [Security Checklist](./checklist.md) - Production security checklist

