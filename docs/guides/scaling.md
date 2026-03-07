# Scaling Guide

Performance tips and scaling strategies for Verani applications.

## Architecture Choice Matters

The biggest scaling decision is your architecture choice:

### Per-Connection Architecture (Recommended)

Use `createConnectionHandler()` + `createRoomHandler()` for:
- **Unlimited horizontal scaling** - Each user has their own DO
- **No single bottleneck** - No single DO handles all connections
- **Cost-efficient** - Idle connections hibernate independently
- **Better fault isolation** - One user's DO crash doesn't affect others

```typescript
import { defineConnection, createConnectionHandler, createRoomHandler } from "verani";

// Each user gets their own DO
const UserConnection = createConnectionHandler(defineConnection({
  onConnect(ctx) {
    ctx.actor.joinRoom("chat");
  }
}));

// Rooms coordinate membership and broadcast
const ChatRoom = createRoomHandler({ name: "ChatRoom" });

// Worker routes to per-user DO
export default {
  async fetch(request) {
    const userId = extractUserId(request);
    const stub = UserConnection.get(userId); // User-specific DO
    return stub.fetch(request);
  }
};
```

## Performance Tips

### 1. Batch Messages

Send multiple updates in one message:

```typescript
// Instead of multiple sends
const updates = [];
updates.push(update1, update2, update3);

// Send as a single batched message via room
await ctx.emit.toRoom("chat").emit("batch.update", { updates });
```

### 3. Enable Hibernation

Verani handles this automatically, but make sure you're not keeping DOs awake unnecessarily:

- Don't use `setInterval()` in the Actor
- Don't keep long-running promises
- Let the Actor sleep when idle

### 4. Optimize Persisted State

When using state persistence:

- **Only persist what you need**: Don't persist frequently-changing data like typing indicators
- **Use shallow mode**: Default shallow tracking is faster than deep proxying
- **Batch updates**: Multiple state changes trigger multiple persistence operations

```typescript
// Good: Only persist meaningful state
state: {
  messageCount: 0,        // Persist this
  settings: { maxUsers: 100 } // Persist this
  // Don't persist: typing indicators, cursor positions, etc.
},
persistedKeys: ["messageCount", "settings"],
```

### 5. Use Rooms for Selective Broadcasting

RoomDOs only broadcast to members:

```typescript
// Join specific rooms instead of one global room
await ctx.actor.joinRoom("project-123");

// Broadcast only reaches room members
await ctx.emit.toRoom("project-123").emit("update", data);
```

## Scaling Characteristics

### Per-Connection Architecture

| Metric | Capacity |
|--------|----------|
| Users | Unlimited (1 DO per user) |
| Messages/sec | Scales with users |
| Memory | Distributed across DOs |
| Hibernation | Per-user (efficient) |

## Horizontal Scaling Example

**1 million users with per-connection architecture:**

```
1,000,000 Users
    ↓
1,000,000 ConnectionDOs (1 per user)
    ↓
N RoomDOs (1 per room/channel)
    ↓
Automatic global distribution
```

Each ConnectionDO:
- Handles 1 WebSocket
- Hibernates independently when idle
- Costs nothing when sleeping

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
- [Persistence Concepts](../concepts/persistence.md) - State persistence and performance

