# Scaling Guide

Performance tips and scaling strategies for Verani applications.

## Performance Tips

### 1. Limit Connections Per Actor

```typescript
import { defineRoom } from "verani";

export const chatRoom = defineRoom({
  onConnect(ctx) {
    const count = ctx.actor.getSessionCount();

    if (count > 1000) {
      ctx.ws.close(1008, "Room is full");
      return;
    }
  }
});
```

### 2. Use Channels for Selective Broadcasting

Instead of broadcasting to everyone:

```typescript
// BAD: Everyone receives, many filter it out
ctx.actor.broadcast("default", data);
// or
ctx.actor.emit.to("default").emit("event", data);

// GOOD: Only subscribed users receive
ctx.actor.broadcast("channel-123", data);
// or using emit API
ctx.actor.emit.to("channel-123").emit("event", data);
```

### 3. Batch Messages

Send multiple updates in one message:

```typescript
// Instead of multiple sends
const updates = [];
updates.push(update1, update2, update3);

// Send as a single batched message
ctx.actor.broadcast("default", {
  type: "batch.update",
  updates
});

// Or using emit API
ctx.actor.emit.to("default").emit("batch.update", {
  updates
});
```

### 4. Enable Hibernation

Verani handles this automatically, but make sure you're not keeping the Actor awake unnecessarily:

- Don't use `setInterval()` in the Actor
- Don't keep long-running promises
- Let the Actor sleep when idle

## Scaling

### Vertical Scaling (Per Actor)

Each Actor can handle:
- ~1,000 WebSocket connections comfortably
- ~10,000 messages/second

Beyond that, split into multiple Actors.

### Horizontal Scaling (Multiple Actors)

Cloudflare automatically scales Actors:
- Each Actor instance runs independently
- Actors are distributed globally
- No cross-Actor coordination needed

**Example:** 1 million users

- User-based routing: 1 million Actors (1 per user)
- Room-based routing: N Actors (1 per room)
- Hybrid: Use both strategies

## Cost Estimation

Cloudflare Workers pricing (as of 2024):

**Free Tier:**
- 100,000 requests/day
- 10ms CPU time per request

**Paid Plan ($5/month):**
- 10 million requests/month included
- $0.50 per million additional requests
- Durable Objects: $0.15 per million requests

**Example Costs:**

| Users | Messages/sec | Monthly Cost |
|-------|--------------|--------------|
| 100   | 10          | Free         |
| 1,000 | 100         | ~$5          |
| 10,000| 1,000       | ~$20         |
| 100,000| 10,000     | ~$100        |

*Estimates only. Actual costs depend on usage patterns.*

## Related Documentation

- [Deployment Guide](./deployment.md) - Deployment steps
- [Monitoring Guide](./monitoring.md) - Logs and metrics
- [Configuration Guide](./configuration.md) - Actor routing strategies

