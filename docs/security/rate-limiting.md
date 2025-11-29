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
  extractMeta(req) {
    // ... auth ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      messageCount: 0,
      windowStart: Date.now()
    };
  },

  onMessage(ctx, frame) {
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
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: {
          message: "Rate limit exceeded",
          retryAfter: Math.ceil(
            (RATE_LIMIT.WINDOW_MS - (now - meta.windowStart)) / 1000
          )
        }
      }));
      return;
    }

    // Process message...
  }
});
```

## Per-User Global Rate Limiting

Use Cloudflare KV or Durable Object storage:

```typescript
export const globalRateLimitRoom = defineRoom({
  async onMessage(ctx, frame) {
    const userId = ctx.meta.userId;
    const key = `ratelimit:${userId}`;

    // Get current count from KV
    const current = await env.KV.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= 100) {
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: { message: "Daily limit exceeded" }
      }));
      return;
    }

    // Increment with TTL
    await env.KV.put(key, (count + 1).toString(), {
      expirationTtl: 86400 // 24 hours
    });

    // Process message...
  }
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Input Validation](./input-validation.md) - Validating user input
- [Vulnerabilities](./vulnerabilities.md) - Common security issues
- [Security Checklist](./checklist.md) - Production security checklist

