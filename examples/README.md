# Verani Examples

Working examples demonstrating Verani's real-time capabilities using the **per-connection architecture**.

## Architecture

Verani uses a per-connection Durable Object pattern where:
- Each user gets their own **ConnectionDO** (identified by userId)
- Room coordination is handled by separate **RoomDOs**
- Message delivery uses DO-to-DO RPC

This provides:
- No single-threaded bottleneck
- Horizontal scalability
- Cost-efficient (idle connections hibernate)
- No message fanout from a single DO

## Examples

### Presence Tracking

**Server**: `presence-connection.ts` + `presence-room-coordinator.ts`
**Client**: `clients/presence-client.ts`

Track who's online with:
- Real-time presence updates
- Multi-device support (same user, multiple terminals)
- Status indicators (online/away/busy)
- Device count per user
- Live updating dashboard

**Usage**:
```bash
bun run examples/clients/presence-client.ts
```

### Chat Room

**Server**: `chat-connection.ts` + `chat-room-coordinator.ts`
**Client**: `clients/chat-client.ts`

Real-time chat application with:
- Message broadcasting
- Typing indicators
- Online user list
- Join/leave notifications

**Usage**:
```bash
bun run examples/clients/chat-client.ts
```

### Typed Echo (Type-Safe Contracts)

**Server**: `typed/echo-server.ts`
**Client**: `typed/echo-client.ts`

Demonstrates tRPC-like type-safe contracts with:
- Shared contract definitions
- Full TypeScript type safety
- Auto-completion for events

**Usage**:
```bash
bun run examples/typed/echo-client.ts
```

## Running Locally

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Development Server

```bash
bun run dev
```

Or directly with Wrangler:
```bash
wrangler dev
```

The server will start at `http://localhost:8787`

### 3. Run Client Examples

In a new terminal:

```bash
# Presence Client
bun run examples/clients/presence-client.ts

# Chat Client
bun run examples/clients/chat-client.ts
```

Each client generates a random username, so you can run multiple instances without conflicts.

### 4. Test Multi-Device

Open multiple terminals running the same client to see real-time synchronization!

## File Structure

```
examples/
├── presence-connection.ts      # ConnectionDO for presence
├── presence-room-coordinator.ts # RoomDO for presence coordination
├── chat-connection.ts          # ConnectionDO for chat
├── chat-room-coordinator.ts    # RoomDO for chat coordination
├── clients/
│   ├── presence-client.ts      # Interactive presence dashboard
│   └── chat-client.ts          # Interactive chat client
└── typed/
    ├── echo-contract.ts        # Type-safe contract definition
    ├── echo-server.ts          # Typed server implementation
    └── echo-client.ts          # Typed client implementation
```

## WebSocket Endpoint

All connections go to: `/ws`

Authentication via query param: `?token=user:username`

Example:
```
ws://localhost:8787/ws?token=user:alice
```

## API Overview

### Connection Handler (ConnectionDO)

```typescript
import { defineConnection, createConnectionHandler } from "verani";

const myConnection = defineConnection({
  name: "MyConnection",
  websocketPath: "/ws",

  extractMeta(req) {
    return {
      userId: extractUserId(req),
      clientId: crypto.randomUUID(),
      channels: ["default"]
    };
  },

  async onConnect(ctx) {
    await ctx.actor.joinRoom("lobby");
    ctx.emit.emit("welcome", { userId: ctx.meta.userId });
  },

  async onDisconnect(ctx) {
    // Room leave is automatic
  }
});

// Register event handlers
myConnection.on("chat", async (ctx, data) => {
  await ctx.emit.toRoom("lobby").emit("chat:message", {
    from: ctx.meta.userId,
    text: data.text
  });
});

export const UserConnection = createConnectionHandler(myConnection);
```

### Room Coordinator (RoomDO)

```typescript
import { createRoomHandler } from "verani";

export const LobbyRoom = createRoomHandler({
  name: "LobbyRoom",

  async onJoin(roomState, userId, metadata) {
    console.log(`User ${userId} joined`);
  },

  async onLeave(roomState, userId) {
    console.log(`User ${userId} left`);
  }
});
```

### Client

```typescript
import { VeraniClient } from "verani/client";

const client = new VeraniClient("ws://localhost:8787/ws?token=user:alice");

client.onOpen(() => {
  console.log("Connected!");
});

client.on("chat:message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});

client.emit("chat", { text: "Hello!" });
```

## Authentication

All examples use simple token-based authentication:

**Token format**: `user:username`

This is for **demonstration purposes only**. In production:

1. Use proper JWT verification
2. Verify token signatures
3. Check expiration
4. Validate user permissions

## Documentation

- [Server API](../docs/api/server.md) - Server-side API reference
- [Client API](../docs/api/client.md) - Client-side API reference
- [Getting Started](../docs/GETTING_STARTED.md) - Build your first app
- [Security Guide](../docs/SECURITY.md) - Production security

## License

ISC
