# Sending Messages via RPC

🔒 **Authenticated** - Send messages to users from HTTP endpoints or other Workers

Since Actors are Durable Objects, you can call their methods remotely using RPC. This is perfect for sending notifications from REST APIs, webhooks, or scheduled tasks.

## Basic RPC Example: Send Notification from HTTP Endpoint

**Room Definition:**

```typescript
import { defineRoom } from "verani";

export const notificationsRoom = defineRoom({
  name: "notifications",
  websocketPath: "/notifications",

  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected to notifications`);
  },

  onMessage(ctx, frame) {
    // Handle client messages if needed
  }
});
```

**Worker with RPC Endpoint:**

```typescript
import { createActorHandler } from "verani";
import { notificationsRoom } from "./rooms/notifications";

const NotificationsRoom = createActorHandler(notificationsRoom);
export { NotificationsRoom };

interface Env {
  NOTIFICATIONS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket connections
    if (url.pathname.startsWith("/notifications")) {
      const id = env.NOTIFICATIONS.idFromName("notifications");
      const stub = env.NOTIFICATIONS.get(id);
      return stub.fetch(request);
    }

    // HTTP endpoint to send notifications via RPC
    if (url.pathname === "/api/send-notification" && request.method === "POST") {
      // Verify authentication (simplified - use proper auth in production)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }

      const { userId, message, type = "info" } = await request.json();

      // Get Actor stub
      const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
      const stub = env.NOTIFICATIONS.get(id);

      // Send notification via RPC
      const sentCount = await stub.sendToUser(userId, "default", {
        type: "notification",
        notificationType: type,
        message,
        timestamp: Date.now()
      });

      return Response.json({
        success: true,
        sentTo: sentCount,
        message: `Notification sent to ${sentCount} session(s)`
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

**Usage:**

```bash
# Send notification via HTTP
curl -X POST https://your-worker.dev/api/send-notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "message": "You have a new message",
    "type": "info"
  }'
```

## Query Actor State via RPC

Get real-time statistics about connected users:

```typescript
// In your Worker fetch handler
if (url.pathname === "/api/stats") {
  const id = env.NOTIFICATIONS.idFromName("notifications");
  const stub = env.NOTIFICATIONS.get(id);

  // Query actor state via RPC
  const [count, userIds] = await Promise.all([
    stub.getSessionCount(),
    stub.getConnectedUserIds()
  ]);

  return Response.json({
    onlineUsers: count,
    userIds,
    timestamp: Date.now()
  });
}
```

## Broadcast from External Event

Send announcements to all users in a channel:

```typescript
// Webhook handler for external events
if (url.pathname === "/webhook/announcement" && request.method === "POST") {
  const { announcement, channel = "default", targetUsers } = await request.json();

  const id = env.CHAT.idFromName("chat-room");
  const stub = env.CHAT.get(id);

  // Broadcast via RPC with optional user filtering
  const opts = targetUsers ? { userIds: targetUsers } : undefined;
  const sentCount = await stub.broadcast(channel, {
    type: "announcement",
    text: announcement,
    timestamp: Date.now()
  }, opts);

  return Response.json({
    success: true,
    sentTo: sentCount,
    message: `Announcement sent to ${sentCount} connection(s)`
  });
}
```

## Scheduled Notifications

Send notifications from scheduled tasks (Cron Triggers):

```typescript
// In wrangler.jsonc, add:
// "triggers": { "crons": ["0 9 * * *"] }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ... existing fetch handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Get list of users who should receive daily digest
    const usersToNotify = await getUsersForDailyDigest();

    // Send to each user's notification Actor
    for (const userId of usersToNotify) {
      const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
      const stub = env.NOTIFICATIONS.get(id);

      await stub.sendToUser(userId, "default", {
        type: "daily-digest",
        date: new Date().toISOString(),
        summary: await getDailySummary(userId)
      });
    }
  }
};
```

## RPC from Another Actor

Call Actor methods from other Actors:

```typescript
// In one Actor's lifecycle hook
onMessage(ctx, frame) {
  if (frame.type === "cross-room-message") {
    const { targetRoom, targetUser, message } = frame.data;

    // Get another Actor's stub
    const targetId = env.OTHER_ROOM.idFromName(targetRoom);
    const targetStub = env.OTHER_ROOM.get(targetId);

    // Send message via RPC
    targetStub.sendToUser(targetUser, "default", {
      type: "cross-room",
      from: ctx.meta.userId,
      message
    });
  }
}
```

## Key Points

1. **Always use `await`**: RPC methods return Promises even if the underlying method is synchronous
2. **Use `RpcBroadcastOptions`**: For broadcast options, use `RpcBroadcastOptions` (excludes `except` WebSocket option)
3. **Actor ID consistency**: Use the same `idFromName()` value for WebSocket connections and RPC calls
4. **Error handling**: RPC calls can fail - wrap in try/catch
5. **Performance**: RPC calls have network overhead - batch operations when possible

## Error Handling

```typescript
try {
  const sentCount = await stub.sendToUser(userId, "default", data);
  console.log(`Sent to ${sentCount} sessions`);
} catch (error) {
  console.error("RPC call failed:", error);
  // Handle error (retry, log, etc.)
}
```

## Related Examples

- [Authentication](./authentication.md) - Secure authentication
- [Basic Chat](./basic-chat.md) - Simple chat room

## Related Documentation

- [RPC Guide](../guides/rpc.md) - Complete RPC guide
- [Server API - RPC Methods](../api/server.md#actorstub---rpc-methods) - RPC API reference

