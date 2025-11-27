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
 * Stored user presence state (persisted in Durable Objects storage)
 */
interface StoredUserPresence {
  username: string;
  status: "online" | "away" | "busy";
  deviceCount: number;
  lastSeen: number;
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
  websocketPath: "/ws/presence",

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

  async onConnect(ctx) {
    console.log(`[Presence][onConnect] User ${ctx.meta.username} connected from device ${ctx.meta.deviceInfo}`);

		// Use transaction for atomic state updates
    await ctx.actor.getStorage().transaction(async (txn) => {
      // Get current user presence from storage
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const existingUser = await txn.get<StoredUserPresence>(storageKey);

      const isNewUser = !existingUser;
      const newDeviceCount = (existingUser?.deviceCount || 0) + 1;

      // Update user presence atomically
      await txn.put(storageKey, {
        username: ctx.meta.username,
        status: ctx.meta.status,
        deviceCount: newDeviceCount,
        lastSeen: Date.now()
      } as StoredUserPresence);

      console.log(`[Presence][onConnect] Storage updated for ${ctx.meta.username} -- device count: ${newDeviceCount}, isNewUser: ${isNewUser}`);

      // Load all users from storage for presence sync
      const allUsers = await loadAllPresenceFromTransaction(txn);
      const presenceList = Array.from(allUsers.entries()).map(([userId, data]) => ({
        userId,
        username: data.username,
        devices: data.deviceCount,
        status: data.status
      }));

      // Calculate totals from storage (source of truth)
      const totalConnections = Array.from(allUsers.values())
        .reduce((sum, user) => sum + user.deviceCount, 0);

      // Send full presence list to new user
      ctx.ws.send(JSON.stringify({
        type: "presence.sync",
        data: {
          users: presenceList,
          totalUsers: allUsers.size,
          totalConnections
        }
      }));

      console.log(`[Presence][onConnect] Sent presence.sync to ${ctx.meta.username}`);

      // Broadcast to others based on whether this is first device
      if (isNewUser) {
        console.log(`[Presence][onConnect] Broadcasting presence.online for ${ctx.meta.username}, first device`);
        ctx.actor.broadcast("default", {
          type: "presence.online",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          status: ctx.meta.status,
          devices: newDeviceCount,
          timestamp: Date.now()
        }, { except: ctx.ws });
      } else {
        console.log(`[Presence][onConnect] Broadcasting presence.update for ${ctx.meta.username}, device count: ${newDeviceCount}`);
        ctx.actor.broadcast("default", {
          type: "presence.update",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          devices: newDeviceCount,
          timestamp: Date.now()
        }, { except: ctx.ws });
      }
    });
  },

  async onMessage(ctx, frame) {
    switch (frame.type) {
      case "presence.status": {
        const { status } = frame.data;

        // Validate status
        if (!["online", "away", "busy"].includes(status)) {
          console.warn(`[Presence][onMessage] Invalid status received: ${status} from ${ctx.meta.username}`);
          ctx.ws.send(JSON.stringify({
            type: "error",
            data: { message: "Invalid status" }
          }));
          return;
        }

        // Update status in storage atomically
        await ctx.actor.getStorage().transaction(async (txn) => {
          const storageKey = `presence:user:${ctx.meta.userId}`;
          const existingUser = await txn.get<StoredUserPresence>(storageKey);

          if (existingUser) {
            await txn.put(storageKey, {
              ...existingUser,
              status,
              lastSeen: Date.now()
            });
            console.log(`[Presence][onMessage] Updated status in storage for ${ctx.meta.username}: ${status}`);
          }
        });

        // Update local metadata
        ctx.meta.status = status;

        // Broadcast status change
        ctx.actor.broadcast("default", {
          type: "presence.status",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          status,
          timestamp: Date.now()
        });

        console.log(`[Presence][onMessage] ${ctx.meta.username} changed status to ${status}`);
        break;
      }

      case "presence.list": {
        // Load presence list from storage (source of truth)
        const allUsers = await loadAllPresenceFromStorage(ctx.actor.getStorage());

        const presenceList = Array.from(allUsers.entries()).map(([userId, data]) => ({
          userId,
          username: data.username,
          devices: data.deviceCount,
          status: data.status
        }));

        const totalConnections = Array.from(allUsers.values())
          .reduce((sum, user) => sum + user.deviceCount, 0);

        ctx.ws.send(JSON.stringify({
          type: "presence.sync",
          data: {
            users: presenceList,
            totalUsers: allUsers.size,
            totalConnections
          }
        }));

        console.log(`[Presence][onMessage] Sent presence.sync (list) to ${ctx.meta.username}`);
        break;
      }

      default:
        console.warn(`[Presence][onMessage] Unknown message type: ${frame.type} from ${ctx.meta.username}`);
    }
  },

  async onDisconnect(ctx) {
    console.log(`[Presence][onDisconnect] ${ctx.meta.username} disconnected from ${ctx.meta.deviceInfo}`);

    // Use transaction for atomic state updates
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const existingUser = await txn.get<StoredUserPresence>(storageKey);

      if (!existingUser) {
        console.warn(`[Presence][onDisconnect] User ${ctx.meta.userId} not found in storage during disconnect`);
        return;
      }

      const newDeviceCount = Math.max(0, existingUser.deviceCount - 1);

      if (newDeviceCount === 0) {
        // User's last device disconnected - remove from storage
        await txn.delete(storageKey);

        console.log(`[Presence][onDisconnect] Removed user ${ctx.meta.username} from storage (last device left)`);

        ctx.actor.broadcast("default", {
          type: "presence.offline",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          timestamp: Date.now()
        });
        console.log(`[Presence][onDisconnect] Broadcasted presence.offline for ${ctx.meta.username}`);
      } else {
        // Update device count in storage
        await txn.put(storageKey, {
          ...existingUser,
          deviceCount: newDeviceCount,
          lastSeen: Date.now()
        });

        console.log(`[Presence][onDisconnect] Updated deviceCount (${newDeviceCount}) for ${ctx.meta.username} in storage`);

        ctx.actor.broadcast("default", {
          type: "presence.update",
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          devices: newDeviceCount,
          timestamp: Date.now()
        });

        console.log(`[Presence][onDisconnect] Broadcasted presence.update for ${ctx.meta.username}`);
      }
    });
  },

  onError(error, ctx) {
    console.error(`[Presence][onError] Error for ${ctx.meta.username}:`, error);
  },

  async onHibernationRestore(actor) {
    console.log("[Presence][onHibernationRestore] Restoring presence state after hibernation");

    // Load all presence data from storage
    const allUsers = await loadAllPresenceFromStorage(actor.getStorage());

    // Reconcile storage with actual connected sessions
    await actor.getStorage().transaction(async (txn) => {
      // Get all connected user IDs from sessions
      const connectedUserIds = new Set<string>();
      const userDeviceCounts = new Map<string, number>();

      for (const session of actor.sessions.values()) {
        const userId = session.meta.userId;
        connectedUserIds.add(userId);
        userDeviceCounts.set(userId, (userDeviceCounts.get(userId) || 0) + 1);
      }

      // Clean up stale entries and sync device counts
      for (const [userId, storedUser] of allUsers.entries()) {
        const actualDeviceCount = userDeviceCounts.get(userId) || 0;
        const storageKey = `presence:user:${userId}`;

        if (actualDeviceCount === 0) {
          // User in storage but no active sessions - remove
          console.log(`[Presence][onHibernationRestore] Removing stale user from storage: ${userId}`);
          await txn.delete(storageKey);
        } else if (actualDeviceCount !== storedUser.deviceCount) {
          // Device count mismatch - sync with actual sessions
          console.log(`[Presence][onHibernationRestore] Syncing device count for ${userId}: ${storedUser.deviceCount} -> ${actualDeviceCount}`);
          await txn.put(storageKey, {
            ...storedUser,
            deviceCount: actualDeviceCount,
            lastSeen: Date.now()
          });
        }
      }

      // Add any users that are in sessions but not in storage
      for (const [userId, deviceCount] of userDeviceCounts.entries()) {
        if (!allUsers.has(userId)) {
          // Find a session for this user to get metadata
          for (const session of actor.sessions.values()) {
            if (session.meta.userId === userId) {
              console.log(`[Presence][onHibernationRestore] Adding missing user to storage: ${userId}`);
              await txn.put(`presence:user:${userId}`, {
                username: session.meta.username,
                status: session.meta.status,
                deviceCount,
                lastSeen: Date.now()
              } as StoredUserPresence);
              break;
            }
          }
        }
      }
    });

    // Send presence sync to all restored connections
    const reconciledUsers = await loadAllPresenceFromStorage(actor.getStorage());
    const presenceList = Array.from(reconciledUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username,
      devices: data.deviceCount,
      status: data.status
    }));

    const totalConnections = Array.from(reconciledUsers.values())
      .reduce((sum, user) => sum + user.deviceCount, 0);

    const syncMessage = JSON.stringify({
      type: "presence.sync",
      data: {
        users: presenceList,
        totalUsers: reconciledUsers.size,
        totalConnections
      }
    });

    // Send to all connected sessions
    for (const session of actor.sessions.values()) {
      try {
        session.ws.send(syncMessage);
        console.log(`[Presence][onHibernationRestore] Sent presence.sync to session: userId=${session.meta.userId}`);
      } catch (error) {
        console.error(`[Presence][onHibernationRestore] Failed to send sync to session: userId=${session.meta.userId}`, error);
      }
    }

    console.log(`[Presence][onHibernationRestore] Restore complete, synced ${actor.sessions.size} sessions`);
  }
});

/**
 * Helper function to load all presence data from storage
 */
async function loadAllPresenceFromStorage(
  storage: DurableObjectStorage
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map<string, StoredUserPresence>();
  const list = await storage.list<StoredUserPresence>({ prefix: "presence:user:" });

  console.log("[Presence][loadAllPresenceFromStorage] Loading presence data from storage");
  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
    console.log(`[Presence][loadAllPresenceFromStorage] Loaded presence for userId=${userId}, deviceCount=${value.deviceCount}, status=${value.status}`);
  }

  return users;
}

/**
 * Helper function to load all presence data from a transaction
 */
async function loadAllPresenceFromTransaction(
  txn: DurableObjectTransaction
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map<string, StoredUserPresence>();
  const list = await txn.list<StoredUserPresence>({ prefix: "presence:user:" });

  console.log("[Presence][loadAllPresenceFromTransaction] Loading presence data from transaction");
  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
    console.log(`[Presence][loadAllPresenceFromTransaction] Loaded presence for userId=${userId}, deviceCount=${value.deviceCount}, status=${value.status}`);
  }

  return users;
}

