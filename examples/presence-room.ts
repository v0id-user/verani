import { defineRoom } from "../src/verani";
import type { ConnectionMeta } from "../src/verani";

/**
 * Extended metadata for presence tracking
 */
interface PresenceMeta extends ConnectionMeta {
  username: string;
  status: "online" | "away" | "busy";
  deviceInfo: string;
  connectedAt: number;
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
 * Get device info from user agent
 */
function getDeviceInfo(req: Request): string {
  const ua = req.headers.get("User-Agent") || "";
  if (ua.includes("Mobile")) return "mobile";
  if (ua.includes("Tablet")) return "tablet";
  return "desktop";
}

/**
 * Presence Room Example
 *
 * Features:
 * - Real-time presence tracking
 * - Multi-device support (same user, multiple connections)
 * - Online/offline/away status
 * - Device type tracking
 * - Presence sync on connect
 */
export const presenceRoom = defineRoom<PresenceMeta>({
  name: "presence-example",

  extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Authentication required");
    }

    const user = validateToken(token);
    if (!user) {
      throw new Error("Invalid token");
    }

    return {
      userId: user.userId,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: user.username,
      status: "online",
      deviceInfo: getDeviceInfo(req),
      connectedAt: Date.now()
    };
  },

  onConnect(ctx) {
    console.log(`[Presence] ${ctx.meta.username} connected from ${ctx.meta.deviceInfo}`);

    // Get all connected users with their device counts
    const usersMap = new Map<string, { username: string; devices: number; status: string }>();

    for (const session of ctx.actor.sessions.values()) {
      const userId = session.meta.userId;
      const existing = usersMap.get(userId);

      if (existing) {
        existing.devices++;
      } else {
        usersMap.set(userId, {
          username: session.meta.username,
          devices: 1,
          status: session.meta.status
        });
      }
    }

    const presenceList = Array.from(usersMap.entries()).map(([userId, data]) => ({
      userId,
      username: data.username,
      devices: data.devices,
      status: data.status
    }));

    // Send full presence list to new user
    ctx.ws.send(JSON.stringify({
      type: "presence.sync",
      data: {
        users: presenceList,
        totalUsers: usersMap.size,
        totalConnections: ctx.actor.getSessionCount()
      }
    }));

    // Get user's device count
    const userSessions = ctx.actor.getUserSessions(ctx.meta.userId);
    const isFirstDevice = userSessions.length === 1;

    // Only notify others if this is the user's first device
    if (isFirstDevice) {
      ctx.actor.broadcast("default", {
        type: "presence.online",
        userId: ctx.meta.userId,
        username: ctx.meta.username,
        status: ctx.meta.status,
        devices: 1,
        timestamp: Date.now()
      }, { except: ctx.ws });
    } else {
      // Update device count for existing user
      ctx.actor.broadcast("default", {
        type: "presence.update",
        userId: ctx.meta.userId,
        username: ctx.meta.username,
        devices: userSessions.length,
        timestamp: Date.now()
      }, { except: ctx.ws });
    }
  },

  onMessage(ctx, frame) {
    switch (frame.type) {
      case "presence.status": {
        const { status } = frame.data;

        // Validate status
        if (!["online", "away", "busy"].includes(status)) {
          ctx.ws.send(JSON.stringify({
            type: "error",
            data: { message: "Invalid status" }
          }));
          return;
        }

        // Update status
        ctx.meta.status = status;

        // Broadcast status change
        ctx.actor.broadcast("default", {
          type: "presence.status",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          status,
          timestamp: Date.now()
        });

        console.log(`[Presence] ${ctx.meta.username} changed status to ${status}`);
        break;
      }

      case "presence.list": {
        // Rebuild and send presence list
        const usersMap = new Map<string, { username: string; devices: number; status: string }>();

        for (const session of ctx.actor.sessions.values()) {
          const userId = session.meta.userId;
          const existing = usersMap.get(userId);

          if (existing) {
            existing.devices++;
          } else {
            usersMap.set(userId, {
              username: session.meta.username,
              devices: 1,
              status: session.meta.status
            });
          }
        }

        const presenceList = Array.from(usersMap.entries()).map(([userId, data]) => ({
          userId,
          username: data.username,
          devices: data.devices,
          status: data.status
        }));

        ctx.ws.send(JSON.stringify({
          type: "presence.sync",
          data: {
            users: presenceList,
            totalUsers: usersMap.size,
            totalConnections: ctx.actor.getSessionCount()
          }
        }));
        break;
      }

      default:
        console.warn(`[Presence] Unknown message type: ${frame.type}`);
    }
  },

  onDisconnect(ctx) {
    console.log(`[Presence] ${ctx.meta.username} disconnected from ${ctx.meta.deviceInfo}`);

    // Get remaining user sessions
    const remainingSessions = ctx.actor.getUserSessions(ctx.meta.userId);

    if (remainingSessions.length === 0) {
      // User's last device disconnected
      ctx.actor.broadcast("default", {
        type: "presence.offline",
        userId: ctx.meta.userId,
        username: ctx.meta.username,
        timestamp: Date.now()
      });
    } else {
      // Update device count
      ctx.actor.broadcast("default", {
        type: "presence.update",
        userId: ctx.meta.userId,
        username: ctx.meta.username,
        devices: remainingSessions.length,
        timestamp: Date.now()
      });
    }
  },

  onError(error, ctx) {
    console.error(`[Presence] Error for ${ctx.meta.username}:`, error);
  }
});

