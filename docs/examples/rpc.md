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
  }
});

// Register event handlers if needed (socket.io-like)
// notificationsRoom.on("some.event", (ctx, data) => {
//   // Handle client messages
// });
```

**Worker with RPC Endpoint:**

```typescript
import { createActorHandler } from "verani";
import { notificationsRoom } from "./rooms/notifications";

const NotificationsRoom = createActorHandler(notificationsRoom);
export { NotificationsRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket connections
    if (url.pathname.startsWith("/notifications")) {
      const stub = NotificationsRoom.get("notifications");
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

      // Get Actor stub (variable name must match wrangler.jsonc class_name)
      const stub = NotificationsRoom.get(`notifications:${userId}`);

      // Send notification via RPC (Socket.IO-like API - direct method call)
      const sentCount = await stub.emitToUser(userId, "notification", {
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
  const stub = NotificationsRoom.get("notifications");

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
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

const ChatRoom = createActorHandler(chatRoom);
export { ChatRoom };

// Webhook handler for external events
if (url.pathname === "/webhook/announcement" && request.method === "POST") {
  const { announcement, channel = "default", targetUsers } = await request.json();

  const stub = ChatRoom.get("chat-room");

  // Broadcast via RPC (Socket.IO-like API - direct method call)
  // Note: For user filtering, use legacy broadcast() API
  let sentCount: number;
  if (targetUsers) {
    // Legacy API needed for filtering
    const opts = { userIds: targetUsers };
    sentCount = await stub.broadcast(channel, {
      type: "announcement",
      text: announcement,
      timestamp: Date.now()
    }, opts);
  } else {
    // Socket.IO-like API - direct method call
    sentCount = await stub.emitToChannel(channel, "announcement", {
      text: announcement,
      timestamp: Date.now()
    });
  }

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
      const stub = NotificationsRoom.get(`notifications:${userId}`);

      // Socket.IO-like API - direct method call
      await stub.emitToUser(userId, "daily-digest", {
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
import { createActorHandler } from "verani";
import { otherRoom } from "./rooms/other";

const OtherRoom = createActorHandler(otherRoom);
export { OtherRoom };

// In one Actor's event handler (socket.io-like)
room.on("cross-room-message", async (ctx, data) => {
  const { targetRoom, targetUser, message } = data;

  // Get another Actor's stub
  const targetStub = OtherRoom.get(targetRoom);

  // Send message via RPC (Socket.IO-like API - direct method call)
  await targetStub.emitToUser(targetUser, "cross-room", {
    from: ctx.meta.userId,
    message
  });
});
```

## Key Points

1. **Socket.IO-like API**: Use `stub.emitToChannel()` and `stub.emitToUser()` for a unified, familiar API with direct method calls
2. **Always use `await`**: RPC methods return Promises even if the underlying method is synchronous
3. **Direct method calls**: Simple, type-safe API without complex builder patterns
4. **Legacy API still available**: `sendToUser()` and `broadcast()` are deprecated but still work for backward compatibility
5. **Use legacy API for filtering**: If you need `userIds` or `clientIds` filtering, use the legacy `broadcast()` method
6. **Actor ID consistency**: Use the same ID string for WebSocket connections and RPC calls to reach the same Actor instance
7. **Variable name must match wrangler.jsonc**: The exported variable name must match the `class_name` in wrangler.jsonc
8. **Error handling**: RPC calls can fail - wrap in try/catch
9. **Performance**: RPC calls have network overhead - batch operations when possible

## Error Handling

```typescript
try {
  // Socket.IO-like API - direct method call
  const sentCount = await stub.emitToUser(userId, "message", data);
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

