# User Presence

🔓 **Public** - Track who is online and notify on join/leave with consistent state management.

**Key Features:**
- Durable storage for consistent presence tracking
- Atomic transactions prevent race conditions
- Survives actor hibernation
- Tracks multiple devices per user

```typescript
import { defineRoom } from "verani";
import type { ConnectionMeta } from "verani";

interface PresenceMeta extends ConnectionMeta {
  username: string;
  status: "online" | "away" | "busy";
  deviceInfo: string;
  connectedAt: number;
}

interface StoredUserPresence {
  username: string;
  status: "online" | "away" | "busy";
  deviceCount: number;
  lastSeen: number;
}

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

function getDeviceInfo(req: Request): string {
  const ua = req.headers.get("User-Agent") || "";
  if (ua.includes("Mobile")) return "mobile";
  if (ua.includes("Tablet")) return "tablet";
  return "desktop";
}

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
    console.log(`[Presence] User ${ctx.meta.username} connected from device ${ctx.meta.deviceInfo}`);

    // Use transaction for atomic state updates
    await ctx.actor.getStorage().transaction(async (txn) => {
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

      // Load all users from storage for presence sync
      const allUsers = await loadAllPresenceFromTransaction(txn);
      const presenceList = Array.from(allUsers.entries()).map(([userId, data]) => ({
        userId,
        username: data.username,
        devices: data.deviceCount,
        status: data.status
      }));

      const totalConnections = Array.from(allUsers.values())
        .reduce((sum, user) => sum + user.deviceCount, 0);

      // Send full presence list to new user using emit API
      ctx.emit.emit("presence.sync", {
        users: presenceList,
        totalUsers: allUsers.size,
        totalConnections
      });

      // Broadcast to others based on whether this is first device using emit API
      if (isNewUser) {
        ctx.actor.emit.to("default").emit("presence.online", {
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          status: ctx.meta.status,
          devices: newDeviceCount,
          timestamp: Date.now()
        });
      } else {
        ctx.actor.emit.to("default").emit("presence.update", {
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          devices: newDeviceCount,
          timestamp: Date.now()
        });
      }
    });
  },

  async onDisconnect(ctx) {
    console.log(`[Presence] ${ctx.meta.username} disconnected from ${ctx.meta.deviceInfo}`);

    // Use transaction for atomic state updates
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const existingUser = await txn.get<StoredUserPresence>(storageKey);

      if (!existingUser) return;

      const newDeviceCount = Math.max(0, existingUser.deviceCount - 1);

      if (newDeviceCount === 0) {
        // User's last device disconnected - remove from storage
        await txn.delete(storageKey);

        // Broadcast offline using emit API
        ctx.actor.emit.to("default").emit("presence.offline", {
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          timestamp: Date.now()
        });
      } else {
        // Update device count in storage
        await txn.put(storageKey, {
          ...existingUser,
          deviceCount: newDeviceCount,
          lastSeen: Date.now()
        });

        // Broadcast update using emit API
        ctx.actor.emit.to("default").emit("presence.update", {
          userId: ctx.meta.userId,
          username: ctx.meta.username,
          devices: newDeviceCount,
          timestamp: Date.now()
        });
      }
    });
  },

  async onHibernationRestore(actor) {
    console.log("[Presence] Restoring presence state after hibernation");

    // Load all presence data from storage
    const allUsers = await loadAllPresenceFromStorage(actor.getStorage());

    // Reconcile storage with actual connected sessions
    await actor.getStorage().transaction(async (txn) => {
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
          await txn.delete(storageKey);
        } else if (actualDeviceCount !== storedUser.deviceCount) {
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
          for (const session of actor.sessions.values()) {
            if (session.meta.userId === userId) {
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

    // Send presence sync to all restored connections using emit API
    const reconciledUsers = await loadAllPresenceFromStorage(actor.getStorage());
    const presenceList = Array.from(reconciledUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username,
      devices: data.deviceCount,
      status: data.status
    }));

    const totalConnections = Array.from(reconciledUsers.values())
      .reduce((sum, user) => sum + user.deviceCount, 0);

    // Broadcast sync to all restored sessions using emit API
    actor.emit.to("default").emit("presence.sync", {
      users: presenceList,
      totalUsers: reconciledUsers.size,
      totalConnections
    });
  }
});

// Register event handlers (socket.io-like)
presenceRoom.on("presence.status", async (ctx, data) => {
  const { status } = data;

  // Validate status
  if (!["online", "away", "busy"].includes(status)) {
    console.warn(`[Presence] Invalid status received: ${status} from ${ctx.meta.username}`);
    ctx.emit.emit("error", { message: "Invalid status" });
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
    }
  });

  // Update local metadata
  ctx.meta.status = status;

  // Broadcast status change using emit API
  ctx.actor.emit.to("default").emit("presence.status", {
    userId: ctx.meta.userId,
    username: ctx.meta.username,
    status,
    timestamp: Date.now()
  });
});

presenceRoom.on("presence.list", async (ctx, data) => {
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

  // Send sync using emit API
  ctx.emit.emit("presence.sync", {
    users: presenceList,
    totalUsers: allUsers.size,
    totalConnections
  });
});

// Helper functions
async function loadAllPresenceFromStorage(
  storage: DurableObjectStorage
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map<string, StoredUserPresence>();
  const list = await storage.list<StoredUserPresence>({ prefix: "presence:user:" });

  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
  }

  return users;
}

async function loadAllPresenceFromTransaction(
  txn: DurableObjectTransaction
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map<string, StoredUserPresence>();
  const list = await txn.list<StoredUserPresence>({ prefix: "presence:user:" });

  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
  }

  return users;
}
```

**Client:**

```typescript
const token = "user:alice"; // In production, get from auth service
const client = new VeraniClient(`wss://example.com/ws/presence?token=${encodeURIComponent(token)}`);

const onlineUsers = new Map();

// Presence sync is always authoritative (from storage)
client.on("presence.sync", ({ users, totalUsers, totalConnections }) => {
  onlineUsers.clear();
  users.forEach(u => onlineUsers.set(u.userId, u));
  updateOnlineList(Array.from(onlineUsers.values()));
  console.log(`Total users: ${totalUsers}, Total connections: ${totalConnections}`);
});

client.on("presence.online", ({ userId, username, status, devices, timestamp }) => {
  onlineUsers.set(userId, { userId, username, status, devices });
  updateOnlineList(Array.from(onlineUsers.values()));
  showNotification(`${username} came online`);
});

client.on("presence.offline", ({ userId, username, timestamp }) => {
  onlineUsers.delete(userId);
  updateOnlineList(Array.from(onlineUsers.values()));
  showNotification(`${username} went offline`);
});

client.on("presence.update", ({ userId, username, devices, timestamp }) => {
  const user = onlineUsers.get(userId);
  if (user) {
    user.devices = devices;
    updateOnlineList(Array.from(onlineUsers.values()));
  }
});

client.on("presence.status", ({ userId, username, status, timestamp }) => {
  const user = onlineUsers.get(userId);
  if (user) {
    user.status = status;
    updateOnlineList(Array.from(onlineUsers.values()));
  }
});

// Change status
client.emit("presence.status", { status: "away" });

// Request presence list
client.emit("presence.list", {});
```

**Why Transactions?**

Without transactions, rapid connect/disconnect events can cause race conditions:

```typescript
// ❌ Race condition - device count can be wrong
const user = await storage.get(key);
const newCount = user.deviceCount + 1;
await storage.put(key, { ...user, deviceCount: newCount });
// Another connection could have changed deviceCount between get and put!

// ✅ Atomic - always consistent
await storage.transaction(async (txn) => {
  const user = await txn.get(key);
  await txn.put(key, { ...user, deviceCount: user.deviceCount + 1 });
});
```

**Hibernation Behavior:**

When an actor hibernates and wakes up:
1. Sessions are restored from WebSocket attachments
2. `onHibernationRestore` reconciles storage with actual connections
3. Stale entries are cleaned up
4. All clients receive a presence sync with current state

See the full example in `examples/presence-room.ts`.

## Related Examples

- [Basic Chat](./basic-chat.md) - Simple chat room
- [Channels](./channels.md) - Multiple channels
- [Authentication](./authentication.md) - Secure authentication

