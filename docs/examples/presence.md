# User Presence

🔓 **Public** - Track who is online and notify on join/leave with consistent state management.

**Key Features:**
- Durable storage for consistent presence tracking
- Atomic transactions prevent race conditions
- Survives actor hibernation
- Tracks multiple devices per user

```typescript
import { defineRoom } from "verani";

interface StoredUserPresence {
  username: string;
  status: "online" | "away" | "busy";
  deviceCount: number;
  lastSeen: number;
}

export const presenceRoom = defineRoom({
  async onConnect(ctx) {
    // Use transactions for atomic updates
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const existing = await txn.get<StoredUserPresence>(storageKey);

      const isNewUser = !existing;
      const newDeviceCount = (existing?.deviceCount || 0) + 1;

      // Store presence atomically
      await txn.put(storageKey, {
        username: ctx.meta.userId,
        status: "online",
        deviceCount: newDeviceCount,
        lastSeen: Date.now()
      });

      // Load all users from storage (source of truth)
      const allUsers = await loadAllPresence(txn);

      // Send presence sync to new user using emit API
      ctx.emit.emit("presence.sync", {
        users: Array.from(allUsers.values()),
        totalUsers: allUsers.size
      });

      // Notify others using emit API
      if (isNewUser) {
        ctx.actor.emit.to("default").emit("presence.online", {
          userId: ctx.meta.userId,
          devices: newDeviceCount
        });
      } else {
        ctx.actor.emit.to("default").emit("presence.update", {
          userId: ctx.meta.userId,
          devices: newDeviceCount
        });
      }
    });
  },

  async onDisconnect(ctx) {
    // Atomic disconnect handling
    await ctx.actor.getStorage().transaction(async (txn) => {
      const storageKey = `presence:user:${ctx.meta.userId}`;
      const user = await txn.get<StoredUserPresence>(storageKey);

      if (!user) return;

      const newDeviceCount = Math.max(0, user.deviceCount - 1);

      if (newDeviceCount === 0) {
        // Last device - remove from storage
        await txn.delete(storageKey);

        ctx.actor.emit.to("default").emit("presence.offline", {
          userId: ctx.meta.userId
        });
      } else {
        // Update device count
        await txn.put(storageKey, {
          ...user,
          deviceCount: newDeviceCount,
          lastSeen: Date.now()
        });

        ctx.actor.emit.to("default").emit("presence.update", {
          userId: ctx.meta.userId,
          devices: newDeviceCount
        });
      }
    });
  },

  async onHibernationRestore(actor) {
    // Reconcile storage with restored sessions after hibernation
    const allUsers = await loadAllPresence(actor.getStorage());

    await actor.getStorage().transaction(async (txn) => {
      // Count actual connected devices
      const actualDeviceCounts = new Map<string, number>();
      for (const session of actor.sessions.values()) {
        const count = actualDeviceCounts.get(session.meta.userId) || 0;
        actualDeviceCounts.set(session.meta.userId, count + 1);
      }

      // Sync storage with reality
      for (const [userId, storedUser] of allUsers.entries()) {
        const actualCount = actualDeviceCounts.get(userId) || 0;

        if (actualCount === 0) {
          // Stale entry - remove
          await txn.delete(`presence:user:${userId}`);
        } else if (actualCount !== storedUser.deviceCount) {
          // Sync count
          await txn.put(`presence:user:${userId}`, {
            ...storedUser,
            deviceCount: actualCount,
            lastSeen: Date.now()
          });
        }
      }
    });

    // Send sync to all restored sessions
    const reconciledUsers = await loadAllPresence(actor.getStorage());
    const syncData = {
      users: Array.from(reconciledUsers.values()),
      totalUsers: reconciledUsers.size
    };

    // Broadcast sync to all restored sessions
    actor.emit.to("default").emit("presence.sync", syncData);
  }
});

// Register event handlers for status updates (socket.io-like)
presenceRoom.on("presence.status", async (ctx, data) => {
  const { status } = data;

  // Validate status
  if (!["online", "away", "busy"].includes(status)) {
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

  // Broadcast status change using emit API
  ctx.actor.emit.to("default").emit("presence.status", {
    userId: ctx.meta.userId,
    status,
    timestamp: Date.now()
  });
});

presenceRoom.on("presence.list", async (ctx, data) => {
  // Load presence list from storage (source of truth)
  const allUsers = await loadAllPresence(ctx.actor.getStorage());

  const presenceList = Array.from(allUsers.entries()).map(([userId, data]) => ({
    userId,
    username: data.username,
    devices: data.deviceCount,
    status: data.status
  }));

  const totalConnections = Array.from(allUsers.values())
    .reduce((sum, user) => sum + user.deviceCount, 0);

  ctx.emit.emit("presence.sync", {
    users: presenceList,
    totalUsers: allUsers.size,
    totalConnections
  });
});

// Helper to load all presence from storage or transaction
async function loadAllPresence(
  storageOrTxn: DurableObjectStorage | DurableObjectTransaction
): Promise<Map<string, StoredUserPresence>> {
  const users = new Map();
  const list = await storageOrTxn.list<StoredUserPresence>({
    prefix: "presence:user:"
  });

  for (const [key, value] of list.entries()) {
    const userId = key.replace("presence:user:", "");
    users.set(userId, value);
  }

  return users;
}
```

**Client:**

```typescript
const onlineUsers = new Map();

// Presence sync is always authoritative (from storage)
client.on("presence.sync", ({ users, totalUsers }) => {
  onlineUsers.clear();
  users.forEach(u => onlineUsers.set(u.userId, u));
  updateOnlineList(Array.from(onlineUsers.values()));
});

client.on("presence.online", ({ userId, devices }) => {
  onlineUsers.set(userId, { userId, devices, status: "online" });
  updateOnlineList(Array.from(onlineUsers.values()));
  showNotification(`${userId} came online`);
});

client.on("presence.offline", ({ userId }) => {
  onlineUsers.delete(userId);
  updateOnlineList(Array.from(onlineUsers.values()));
});

client.on("presence.update", ({ userId, devices }) => {
  const user = onlineUsers.get(userId);
  if (user) {
    user.devices = devices;
    updateOnlineList(Array.from(onlineUsers.values()));
  }
});
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

