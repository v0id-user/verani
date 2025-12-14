# Typed Contracts

Understanding the mental model behind type-safe event contracts in Verani.

## The Two-Way Street

WebSocket communication is bidirectional. Messages flow in two directions:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   SERVER (Cloudflare Worker)          CLIENT (Browser/App)      │
│                                                                 │
│   ┌─────────────────┐                 ┌─────────────────┐       │
│   │                 │   serverEvents  │                 │       │
│   │   Room/Actor    │ ───────────────▶│   TypedClient   │       │
│   │                 │   (server emits,│                 │       │
│   │   createTyped   │    client listens)                │       │
│   │   Room()        │                 │   createTyped   │       │
│   │                 │   clientEvents  │   Client()      │       │
│   │                 │ ◀───────────────│                 │       │
│   │                 │   (client emits,│                 │       │
│   │                 │    server handles)                │       │
│   └─────────────────┘                 └─────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Event Direction Mental Model

Think about event names from the **perspective of who SENDS the event**:

| Event Type | Who Sends | Who Receives | Server Does | Client Does |
|------------|-----------|--------------|-------------|-------------|
| `serverEvents` | Server | Client | `emit()` | `on()` |
| `clientEvents` | Client | Server | `on()` | `emit()` |

### serverEvents = "Events the Server Sends"

These are events that **originate from the server** and are **received by clients**.

```typescript
serverEvents: {
  "chat.message": payload<{ from: string; text: string }>(),
  "user.joined": payload<{ userId: string }>(),
  "error": payload<{ code: string; message: string }>(),
}
```

- **Server**: Calls `ctx.emit("chat.message", { ... })` to send
- **Client**: Calls `client.on("chat.message", (data) => { ... })` to receive

### clientEvents = "Events the Client Sends"

These are events that **originate from clients** and are **received by the server**.

```typescript
clientEvents: {
  "message.send": payload<{ text: string }>(),
  "typing.start": payload<{ conversationId: string }>(),
  "presence.update": payload<{ status: "online" | "away" }>(),
}
```

- **Client**: Calls `client.emit("message.send", { text: "Hello" })` to send
- **Server**: Calls `room.on("message.send", (ctx, data) => { ... })` to receive

## Why This Naming?

The naming follows a simple rule: **events are named after their source**.

This makes it intuitive when reading the contract:

```typescript
const chatContract = defineContract({
  // "What does the server tell clients?"
  serverEvents: {
    "chat.message": payload<{ from: string; text: string }>(),
    "user.joined": payload<{ userId: string }>(),
  },
  
  // "What do clients tell the server?"
  clientEvents: {
    "message.send": payload<{ text: string }>(),
    "typing.start": payload<{ conversationId: string }>(),
  },
});
```

## Type Safety in Action

The contract enforces correct usage at compile time:

### Server Side

```typescript
const room = createTypedRoom(chatContract, { ... });

// Server can emit serverEvents
ctx.emit("chat.message", { from: "alice", text: "Hello" });

// Server can listen to clientEvents
room.on("message.send", (ctx, data) => {
  // data.text is typed as string
});

// TypeScript Error: Server can't emit clientEvents
ctx.emit("message.send", { text: "Hello" });

// TypeScript Error: Server can't listen to serverEvents
room.on("chat.message", (ctx, data) => { });
```

### Client Side

```typescript
const client = createTypedClient(chatContract, url);

// Client can listen to serverEvents
client.on("chat.message", (data) => {
  // data.from and data.text are typed
});

// Client can emit clientEvents
client.emit("message.send", { text: "Hello" });

// TypeScript Error: Client can't listen to clientEvents
client.on("message.send", (data) => { });

// TypeScript Error: Client can't emit serverEvents
client.emit("chat.message", { from: "me", text: "Hello" });
```

## Common Patterns

### Request-Response Pattern

Client sends a request, server responds with a result:

```typescript
const apiContract = defineContract({
  serverEvents: {
    "users.list.result": payload<{ users: User[] }>(),
    "users.get.result": payload<{ user: User }>(),
    "error": payload<{ requestId: string; message: string }>(),
  },
  clientEvents: {
    "users.list": payload<{ page: number; limit: number }>(),
    "users.get": payload<{ userId: string }>(),
  },
});
```

### Broadcast Pattern

Server broadcasts state to all connected clients:

```typescript
const presenceContract = defineContract({
  serverEvents: {
    "presence.sync": payload<{ users: Record<string, Status> }>(),
    "presence.update": payload<{ userId: string; status: Status }>(),
  },
  clientEvents: {
    "presence.set": payload<{ status: Status }>(),
  },
});
```

### Bidirectional Messaging

Both sides can initiate messages:

```typescript
const chatContract = defineContract({
  serverEvents: {
    "message.received": payload<{ id: string; from: string; text: string }>(),
    "message.delivered": payload<{ id: string }>(),
    "message.read": payload<{ id: string; by: string }>(),
  },
  clientEvents: {
    "message.send": payload<{ text: string; to?: string }>(),
    "message.markRead": payload<{ ids: string[] }>(),
  },
});
```

## Quick Reference

| I want to... | Event Type | Method |
|--------------|------------|--------|
| Server sends data to client | `serverEvents` | `ctx.emit()` |
| Client receives data from server | `serverEvents` | `client.on()` |
| Client sends data to server | `clientEvents` | `client.emit()` |
| Server receives data from client | `clientEvents` | `room.on()` |

## Related Documentation

- [Typed API](../api/typed.md) - Complete typed API reference
- [Emits and Channels](./emits-channels.md) - Emit patterns and channel targeting
- [Architecture](./architecture.md) - System architecture overview

