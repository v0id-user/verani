# Mental Model

Understanding Verani's architecture and design philosophy.

## Core Philosophy

Verani is designed around one simple idea: **make realtime on Cloudflare feel like Socket.io**.

If you're familiar with Socket.io, you already understand 80% of Verani. The key difference is that Verani is built specifically for Cloudflare's Actor model and handles hibernation correctly.

## The Three Core Concepts

### 1. Actors = Isolated Realtime Containers

Think of each Actor instance as a **self-contained realtime room**.

```
┌─────────────────────────────────────┐
│ Actor Instance (Durable Object)     │
│                                      │
│  ┌────────┐  ┌────────┐  ┌────────┐│
│  │WebSocket│ │WebSocket│ │WebSocket││
│  │  User A │ │  User B │ │  User C ││
│  └────────┘  └────────┘  └────────┘│
│                                      │
│  Memory: Sessions Map               │
│  Hibernation: Attachments           │
└─────────────────────────────────────┘
```

**Key insight**: You control isolation by how you route requests to Actors.

- **Chat room**: Route by room ID → everyone in room shares Actor
- **User feed**: Route by user ID → each user gets their own Actor
- **Game session**: Route by game ID → players in same game share Actor

### 2. Channels = Sub-rooms Within an Actor

Inside a single Actor, connections can subscribe to different **channels** for selective message delivery.

```
Actor: "game-room-123"
├── Channel: "default"
│   ├── User A
│   ├── User B
│   └── User C
├── Channel: "game-state"
│   ├── User A
│   └── User B
└── Channel: "chat"
    └── User C
```

When you broadcast to a channel, only connections subscribed to that channel receive the message:

```typescript
// Only users in "game-state" channel receive this
ctx.actor.broadcast("game-state", { score: 100 });
```

**Default behavior**: Every connection starts in the `["default"]` channel.

### 3. Hibernation = Sleep Mode for Actors

Cloudflare Actors **hibernate** when idle to save resources. This means:

1. **In-memory state is lost** (like the `sessions` Map)
2. **WebSocket connections stay alive** and can wake the Actor
3. **You need to restore state** when the Actor wakes up

Verani solves this automatically:

```typescript
// On connect: Store metadata in WebSocket attachment
storeAttachment(ws, { userId, clientId, channels });

// On wake: Restore all sessions from attachments
restoreSessions(actor);
```

**Mental model**: Think of attachments as "sticky notes" on each WebSocket that survive hibernation.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                        │
│                                                               │
│  Request → nameFromRequest() → Actor Instance                │
│                                      │                        │
│                                      ▼                        │
│                          ┌───────────────────────┐          │
│                          │ Verani Actor Runtime  │          │
│                          │                       │          │
│                          │ onWebSocketConnect    │          │
│                          │ onWebSocketMessage    │          │
│                          │ onWebSocketDisconnect │          │
│                          │ onInit (restore)      │          │
│                          └───────────────────────┘          │
│                                      │                        │
│                                      ▼                        │
│                          ┌───────────────────────┐          │
│                          │   Your Room Hooks     │          │
│                          │                       │          │
│                          │   onConnect()         │          │
│                          │   onMessage()         │          │
│                          │   onDisconnect()      │          │
│                          └───────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ WebSocket
                                   │
                          ┌────────┴─────────┐
                          │  VeraniClient    │
                          │                  │
                          │  emit()          │
                          │  on()            │
                          │  reconnect()     │
                          └──────────────────┘
```

## State Management

Verani distinguishes three types of state:

### 1. Connection Metadata (Survives Hibernation)

Stored in **WebSocket attachments** and **in-memory sessions**.

```typescript
interface ConnectionMeta {
  userId: string;
  clientId: string;
  channels: string[];
}
```

**Use case**: Who is connected, what channels they're in.

### 2. Ephemeral Actor State (Lost on Hibernation)

Stored only in memory, acceptable to lose.

```typescript
class MyActor extends Actor {
  presenceCount = 0; // Lost on hibernation, that's OK
}
```

**Use case**: Temporary counters, rate limits, cached computed values.

### 3. Durable State (Optional, Not in MVP)

Stored in Durable Object storage or external database.

```typescript
// Future feature
await ctx.actor.storage.put("lastMessage", message);
```

**Use case**: Chat history, persistent configuration, audit logs.

## Message Flow

### Client → Server

```
Client calls emit("type", data)
         ↓
   Encode to JSON
         ↓
   Send via WebSocket
         ↓
Actor receives raw message
         ↓
   Decode JSON to MessageFrame
         ↓
Call onMessage(ctx, frame)
         ↓
   Your business logic
```

### Server → Client(s)

```
Call actor.broadcast(channel, data)
         ↓
Filter sessions by:
  - channel subscription
  - userIds (optional)
  - clientIds (optional)
  - except (optional)
         ↓
For each matching session:
  - Encode to JSON
  - ws.send(json)
         ↓
Client receives message
         ↓
Decode and dispatch to listeners
```

## Isolation Strategy

Verani provides **three levels of isolation**:

### Level 1: Actor-Level Isolation

**Mechanism**: Different Actor instances (Durable Objects)

**Use case**: Completely separate groups of users

```typescript
// User A → Actor "user:alice"
// User B → Actor "user:bob"
// They never share state
```

### Level 2: Channel-Level Isolation

**Mechanism**: `meta.channels` array within same Actor

**Use case**: Sub-groups within the same logical room

```typescript
// Both in Actor "room:123"
// User A: channels = ["default", "admin"]
// User B: channels = ["default"]
// Admin messages only go to User A
```

### Level 3: User-Level Filtering

**Mechanism**: Broadcast filters by `userId` or `clientId`

**Use case**: Direct messages within a room

```typescript
// Send only to specific user
ctx.actor.broadcast("default", data, {
  userIds: ["alice"]
});
```

## Connection Lifecycle

### Server Side

```
WebSocket connects
      ↓
extractMeta(request)  → { userId, clientId, channels }
      ↓
storeAttachment(ws, meta)
      ↓
sessions.set(ws, { ws, meta })
      ↓
onConnect(ctx)
      ↓
[connection active, messages flow]
      ↓
WebSocket closes
      ↓
sessions.delete(ws)
      ↓
onDisconnect(ctx)
```

### Client Side

```
new VeraniClient(url)
      ↓
State: "connecting"
      ↓
WebSocket opens
      ↓
State: "connected"
      ↓
[connection active, messages flow]
      ↓
WebSocket closes (unexpected)
      ↓
State: "reconnecting"
      ↓
Exponential backoff delay
      ↓
Retry connection
```

## Error Handling Philosophy

Verani follows the principle: **fail gracefully, log loudly**.

- **User hooks** (onConnect, onMessage, etc.) are wrapped in try-catch
- **Errors are logged** with `[Verani]` prefix for easy filtering
- **Optional `onError` hook** lets you handle errors your way
- **Client never sees server errors** (security)
- **Automatic recovery** when possible (reconnection, session restoration)

## Design Constraints

What Verani is **intentionally simple** about:

1. **No global user registry**: You manage user→actor routing
2. **No cross-actor messaging**: Each Actor is independent
3. **No ordering guarantees**: WebSockets are unordered by default
4. **No message persistence**: Messages are ephemeral (add your own if needed)
5. **JSON only**: Binary protocols are future work

These constraints keep Verani simple, predictable, and maintainable.

## When to Use Verani vs Alternatives

### Use Verani when:

- ✅ You're on Cloudflare Workers/Pages
- ✅ You want Socket.io-like simplicity
- ✅ You need automatic hibernation handling
- ✅ Your rooms are independent (no cross-room messaging needed)
- ✅ You want minimal dependencies

### Consider alternatives when:

- ❌ You need cross-room/cross-server messaging (use Cloudflare Pub/Sub)
- ❌ You need complex presence (wait for Verani 0.2 or build custom)
- ❌ You need guaranteed message ordering (use queues)
- ❌ You're not on Cloudflare (use Socket.io, Ably, Pusher, etc.)

## Summary

Remember these three mental models:

1. **Actor = Room**: Each Actor is an isolated realtime container
2. **Channels = Sub-rooms**: Filter messages within an Actor
3. **Attachments = Hibernation Survival**: WebSocket metadata persists

Everything else follows from these principles.

