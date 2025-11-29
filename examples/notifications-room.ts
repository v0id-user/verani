import { defineRoom } from "../src/verani";
import type { ConnectionMeta } from "../src/verani";

/**
 * Extended metadata for notifications
 */
interface NotificationMeta extends ConnectionMeta {
  username: string;
}

/**
 * Notification data structure
 */
interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

/**
 * Simple token validation
 */
function validateToken(token: string): { userId: string; username: string } | null {
  const parts = token.split(":");
  if (parts.length === 2 && parts[0] === "user") {
    return {
      userId: parts[1],
      username: parts[1]
    };
  }
  return null;
}

/**
 * Notifications Room Example
 *
 * Features:
 * - Personal notification feed (1 Actor per user)
 * - Push notifications from server
 * - Read/unread tracking
 * - Notification history
 * - Real-time delivery to all user devices
 *
 * Route this Actor by userId: `notifications:${userId}`
 */
export const notificationsRoom = defineRoom<NotificationMeta>({
  name: "notifications-example",
  websocketPath: "/ws/notifications",

  extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const userId = url.searchParams.get("userId");

    if (!token) {
      throw new Error("Authentication required");
    }

    const user = validateToken(token);
    if (!user) {
      throw new Error("Invalid token");
    }

    // Verify user can only access their own notifications
    if (userId && userId !== user.userId) {
      throw new Error("Unauthorized: Cannot access other user's notifications");
    }

    return {
      userId: user.userId,
      clientId: crypto.randomUUID(),
      channels: ["notifications"],
      username: user.username
    };
  },

  onConnect(ctx) {
    console.log(`[Notifications] ${ctx.meta.username} connected`);

    // Send recent notifications using emit API
    // In production, load from Durable Object storage
    const recentNotifications: Notification[] = [
      {
        id: crypto.randomUUID(),
        type: "info",
        title: "Welcome!",
        message: `Welcome to the notifications feed, ${ctx.meta.username}!`,
        timestamp: Date.now(),
        read: false
      }
    ];

    ctx.emit.emit("notifications.sync", {
      notifications: recentNotifications,
      unreadCount: recentNotifications.filter(n => !n.read).length
    });

    // Notify user's other devices using emit API
    const deviceCount = ctx.actor.getUserSessions(ctx.meta.userId).length;
    if (deviceCount > 1) {
      ctx.actor.emit.to("notifications").emit("device.connected", {
        deviceCount,
        timestamp: Date.now()
      });
    }
  },

  onDisconnect(ctx) {
    console.log(`[Notifications] ${ctx.meta.username} disconnected`);

    // Notify remaining devices using emit API
    const remainingDevices = ctx.actor.getUserSessions(ctx.meta.userId).length;
    if (remainingDevices > 0) {
      ctx.actor.emit.to("notifications").emit("device.disconnected", {
        deviceCount: remainingDevices,
        timestamp: Date.now()
      });
    }
  },

  onError(error, ctx) {
    console.error(`[Notifications] Error for ${ctx.meta.username}:`, error);
  }
});

// Register event handlers (socket.io-like)
notificationsRoom.on("notification.read", (ctx, data) => {
  const { notificationId } = data;

  if (!notificationId) {
    ctx.emit.emit("error", { message: "Missing notification ID" });
    return;
  }

  // Mark as read (in production, update storage)
  console.log(`[Notifications] ${ctx.meta.username} read notification ${notificationId}`);

  // Broadcast to all user's devices using emit API
  ctx.actor.emit.to("notifications").emit("notification.read", {
    notificationId,
    timestamp: Date.now()
  });
});

notificationsRoom.on("notification.readAll", (ctx, data) => {
  console.log(`[Notifications] ${ctx.meta.username} marked all as read`);

  // Broadcast to all user's devices using emit API
  ctx.actor.emit.to("notifications").emit("notification.readAll", {
    timestamp: Date.now()
  });
});

notificationsRoom.on("notification.delete", (ctx, data) => {
  const { notificationId } = data;

  if (!notificationId) {
    ctx.emit.emit("error", { message: "Missing notification ID" });
    return;
  }

  // Delete (in production, remove from storage)
  console.log(`[Notifications] ${ctx.meta.username} deleted notification ${notificationId}`);

  // Broadcast to all user's devices using emit API
  ctx.actor.emit.to("notifications").emit("notification.deleted", {
    notificationId,
    timestamp: Date.now()
  });
});

notificationsRoom.on("notifications.list", (ctx, data) => {
  // Resend notifications list using emit API
  // In production, load from storage
  ctx.emit.emit("notifications.sync", {
    notifications: [],
    unreadCount: 0
  });
});

/**
 * Helper function to push notifications to a user
 * Call this from external services/Workers
 */
export async function pushNotification(
  userId: string,
  notification: Omit<Notification, "id" | "timestamp" | "read">,
  env: any
) {
  // Get the user's notification Actor
  const id = env.NOTIFICATIONS.idFromName(`notifications:${userId}`);
  const stub = env.NOTIFICATIONS.get(id);

  // Get all user's WebSockets
  const sockets = await stub.getWebSockets();

  const fullNotification: Notification = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    read: false,
    ...notification
  };

  // Send to all connected devices
  sockets.forEach((ws: WebSocket) => {
    ws.send(JSON.stringify({
      type: "notification.new",
      data: fullNotification
    }));
  });

  console.log(`[Notifications] Pushed to ${userId}: ${notification.title}`);
}

