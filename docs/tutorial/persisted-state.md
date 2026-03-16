# Persisted State & Storage

Cloudflare Durable Objects hibernate when idle — your in-memory state disappears. Verani gives you three ways to keep data alive:

| Method | Best for | Persistence | Auto-sync |
|--------|----------|-------------|-----------|
| **Persisted State** (`ctx.state`) | Per-user config, counters, preferences | Automatic | Yes |
| **Direct Storage** (`ctx.actor.getStorage()`) | Large data, lists, custom schemas | Manual | No |
| **WebSocket Attachments** (metadata) | Session data (userId, username) | Automatic | Yes |

---

## Persisted State

The simplest way to keep per-connection data. Define an initial state, mark which keys to persist, and Verani handles the rest — serialization, storage, and restoration after hibernation.

### Basic Example

```typescript
import { defineConnection, createConnectionHandler } from "verani";

interface Meta {
  userId: string;
  clientId: string;
  channels: string[];
}

interface UserState {
  messageCount: number;
  lastSeen: number;
  theme: string;
}

const connection = defineConnection<Meta, Env, UserState>({
  name: "UserConnection",
  websocketPath: "/ws",
  connectionBinding: "UserConnection",

  // Initial state for new connections
  state: {
    messageCount: 0,
    lastSeen: 0,
    theme: "dark",
  },

  // Which keys survive hibernation and reconnection
  persistedKeys: ["messageCount", "lastSeen", "theme"],

  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") ?? crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      channels: ["default"],
    };
  },

  async onConnect(ctx) {
    // State is already loaded from storage. Read it directly:
    console.log(`User has sent ${ctx.state.messageCount} messages`);

    // Write to it — persisted automatically:
    ctx.state.lastSeen = Date.now();
  },
});

connection.on<{ text: string }>("message", async (ctx, data) => {
  // Increment counter — auto-persisted
  ctx.state.messageCount++;
  ctx.state.lastSeen = Date.now();

  // Use state in your logic
  await ctx.emit.toRoom("chat").emit("message", {
    text: data.text,
    messageNumber: ctx.state.messageCount,
  });
});

export const UserConnection = createConnectionHandler(connection);
```

### How It Works

1. On first connection, `state` provides the initial values.
2. Verani wraps the state in a Proxy that intercepts writes.
3. When you assign `ctx.state.messageCount++`, Verani serializes the value and writes it to Durable Object storage under `_verani_persist:messageCount`.
4. When the DO wakes from hibernation, Verani reads these keys and restores the state.
5. On reconnection, the same state is available.

### Shallow vs Deep Tracking

By default, only **top-level** assignments trigger persistence:

```typescript
// This WILL persist (top-level assignment):
ctx.state.theme = "light";

// This will NOT persist (nested mutation, shallow mode):
ctx.state.preferences.fontSize = 16;

// To persist nested changes, reassign the whole object:
ctx.state.preferences = { ...ctx.state.preferences, fontSize: 16 };
```

To track nested mutations automatically, use deep mode:

```typescript
const connection = defineConnection<Meta, Env, MyState>({
  state: { nested: { count: 0 } },
  persistedKeys: ["nested"],
  persistOptions: { shallow: false }, // Enable deep tracking
  // ...
});

// Now this persists automatically:
ctx.state.nested.count++;
```

> **Performance note:** Deep tracking wraps every nested object in a Proxy. For state with many nested levels, shallow mode with explicit reassignment is more efficient.

### Error Handling

Storage operations can fail (quota exceeded, transient errors). Handle them:

```typescript
const connection = defineConnection<Meta, Env, MyState>({
  state: { counter: 0 },
  persistedKeys: ["counter"],
  persistOptions: { throwOnError: false }, // Don't crash on storage errors

  onPersistError(key, error) {
    console.error(`Failed to persist "${key}":`, error.message);
    // Optionally: notify monitoring, retry, etc.
  },
  // ...
});
```

With `throwOnError: true` (default), a failed write throws a `PersistError` that you can catch in your event handlers.

---

## Direct Storage Access

For data that doesn't fit the key-value state model — large blobs, lists with many entries, or custom storage patterns — use the Durable Object storage API directly.

### Reading and Writing

```typescript
connection.on("saveNote", async (ctx, data) => {
  const storage = ctx.actor.getStorage();

  // Write any serializable value
  await storage.put(`note:${data.id}`, {
    text: data.text,
    createdAt: Date.now(),
    author: ctx.meta.userId,
  });
});

connection.on("getNotes", async (ctx) => {
  const storage = ctx.actor.getStorage();

  // List all notes (prefix scan)
  const notes = await storage.list<{ text: string; createdAt: number }>({
    prefix: "note:",
  });

  const noteList = Array.from(notes.values());
  ctx.emit.emit("notes", { notes: noteList });
});
```

### Deleting Data

```typescript
connection.on("deleteNote", async (ctx, data) => {
  const storage = ctx.actor.getStorage();
  await storage.delete(`note:${data.id}`);
});
```

### Transactions

Durable Object storage supports atomic transactions:

```typescript
connection.on("transfer", async (ctx, data) => {
  const storage = ctx.actor.getStorage();

  await storage.transaction(async (txn) => {
    const balance = await txn.get<number>("balance") ?? 0;
    if (balance < data.amount) {
      ctx.emit.emit("error", { message: "Insufficient balance" });
      return;
    }
    await txn.put("balance", balance - data.amount);
    await txn.put(`txn:${crypto.randomUUID()}`, {
      amount: data.amount,
      to: data.recipient,
      timestamp: Date.now(),
    });
  });
});
```

### SQL Storage

Durable Objects with SQLite support (which Verani uses) also expose a SQL API:

```typescript
connection.on("query", async (ctx) => {
  const storage = ctx.actor.getStorage();

  // Use the sql tagged template
  storage.sql.exec(
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );

  const rows = storage.sql.exec(
    `SELECT * FROM messages ORDER BY created_at DESC LIMIT 50`
  ).toArray();

  ctx.emit.emit("history", { messages: rows });
});
```

---

## Choosing the Right Approach

### Use Persisted State when:
- You have a small number of per-user settings or counters
- Values are simple (strings, numbers, small objects)
- You want zero-boilerplate read/write

### Use Direct Storage when:
- You need prefix scans or batch operations
- Data is large or has many entries
- You need transactions
- You want SQL queries

### Use Both Together

```typescript
const connection = defineConnection<Meta, Env, UserState>({
  // Persisted state for quick access
  state: { messageCount: 0, online: false },
  persistedKeys: ["messageCount"],

  async onConnect(ctx) {
    ctx.state.online = true; // Not persisted (not in persistedKeys)
    ctx.state.messageCount; // Persisted, auto-loaded

    // Direct storage for message history
    const storage = ctx.actor.getStorage();
    const recent = await storage.list({ prefix: "msg:", limit: 50 });
    ctx.emit.emit("history", { messages: Array.from(recent.values()) });
  },
});

connection.on<{ text: string }>("message", async (ctx, data) => {
  ctx.state.messageCount++;

  const storage = ctx.actor.getStorage();
  await storage.put(`msg:${Date.now()}`, {
    text: data.text,
    author: ctx.meta.userId,
  });
});
```

---

## Storage Limits

These are Cloudflare Durable Object storage limits (check the [Cloudflare docs](https://developers.cloudflare.com/durable-objects/platform/limits/) for current numbers):

| Resource | Limit |
|----------|-------|
| Key size | 2 KiB |
| Value size | 128 KiB |
| Keys per `list()` | 1,000 (paginate with `startAfter`) |
| Storage per DO | 1 GiB (SQLite), 256 MiB (KV) |
| Writes per request | 6 × the Worker's CPU limit |

---

## Related

- [Build a Chat App](./build-a-chat-app.md) — Step-by-step tutorial
- [State Management Concepts](../concepts/state-management.md) — Architecture deep dive
- [API Reference: Server](../api/server.md) — Full `defineConnection` API
- [Cloudflare DO Storage Docs](https://developers.cloudflare.com/durable-objects/api/storage-api/)
