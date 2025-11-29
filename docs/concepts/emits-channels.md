# Emits and Channels

Understanding how message emission and channel filtering work in Verani.

## Overview

Verani provides a Socket.io-like emit API for sending messages between clients and servers. Messages are organized into **channels**, which act as sub-rooms within an Actor for selective message delivery.

**Key Concepts:**
- **Channels**: Sub-rooms within an Actor that filter which connections receive broadcasts
- **Socket-Level Emits**: Send messages from a specific connection context (`ctx.emit`)
- **Actor-Level Emits**: Broadcast messages from the Actor instance (`actor.emit`)
- **Client Emits**: Send messages from client to server (`client.emit()`)
- **Event Listeners**: Receive messages on the client (`client.on()`)

For more on Actors and Channels, see [Actors and Channels](./actors-channels.md).

## Channels

Channels are sub-rooms within an Actor that enable selective message delivery. Each connection has a `channels` array in its metadata that determines which channels it subscribes to.

### Channel Subscription

When a connection is established, the `extractMeta()` function sets the initial channels:

```typescript
const room = defineRoom({
  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") || "anonymous",
      clientId: crypto.randomUUID(),
      channels: ["default"] // Initial channel subscription
    };
  }
});
```

**Default Behavior**: Every connection starts in the `["default"]` channel unless specified otherwise.

### Channel Filtering

When broadcasting to a channel, only connections whose `meta.channels` array includes that channel will receive the message:

```typescript
// Only connections subscribed to "game-state" receive this
ctx.actor.emit.to("game-state").emit("score", { score: 100 });
```

The broadcast implementation filters sessions by checking `meta.channels.includes(channel)` before sending. See [src/actor/runtime/broadcast.ts](../src/actor/runtime/broadcast.ts) for implementation details.

## Server-Side Emits

Verani provides two levels of emit APIs on the server: **socket-level** (for individual connections) and **actor-level** (for broadcasting).

### Socket-Level Emits (`ctx.emit`)

Available in message context (`MessageContext`) within lifecycle hooks and event handlers.

#### Emit to Current Socket

Send a message only to the current connection:

```typescript
room.on("chat.message", (ctx, data) => {
  // Send acknowledgment to sender only
  ctx.emit.emit("message.received", { id: data.id });
});
```

#### Emit to Channel (Excluding Sender)

Broadcast to a channel, excluding the current socket:

```typescript
room.on("chat.message", (ctx, data) => {
  // Broadcast to "default" channel, excluding sender
  ctx.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

**How it works**: If the target matches one of the current user's channels, it broadcasts to that channel excluding the current socket. See [src/actor/runtime/emit.ts](../src/actor/runtime/emit.ts) `createSocketEmit()` lines 80-99.

#### Emit to User

Send a message to all sessions belonging to a specific user:

```typescript
room.on("private.message", (ctx, data) => {
  // Send to specific user (all their sessions)
  ctx.emit.to(data.targetUserId).emit("private.message", {
    from: ctx.meta.userId,
    text: data.text
  });
});
```

**How it works**: If the target doesn't match any of the current user's channels, it's treated as a userId and sent to all sessions of that user. The message is sent to sessions that are subscribed to the default channel (first channel in `meta.channels`).

#### 1-to-1 Messaging

For direct messaging between two users, both users must:
1. **Be connected to the same Actor instance** (same room/context)
2. **Be subscribed to at least one common channel** (typically `"default"`)

This requirement ensures that users are in the same logical space before they can exchange messages. Channels act as the delivery mechanism - if users aren't subscribed to a common channel, messages won't be delivered.

**Example: Direct Messaging**

**Server:**
```typescript
room.on("direct.message", (ctx, data) => {
  // Send to specific user (all their sessions)
  // Uses default channel - recipient must be subscribed to it
  const sentCount = ctx.emit.to(data.targetUserId).emit("direct.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });

  // Optional: Send acknowledgment to sender
  if (sentCount === 0) {
    ctx.emit.emit("error", {
      message: "User not found or not subscribed to default channel"
    });
  }
});
```

**Client:**
```typescript
const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Send direct message
client.emit("direct.message", {
  targetUserId: "bob",
  text: "Hello Bob!"
});

// Receive direct messages
client.on("direct.message", (data) => {
  console.log(`From ${data.from}: ${data.text}`);
});
```

**Alternative: Using sendToUser with explicit channel**

If you want more control over which channel to use for direct messages:

```typescript
room.on("direct.message", (ctx, data) => {
  // Send to user on a specific channel
  const sentCount = ctx.actor.sendToUser(
    data.targetUserId,
    "default", // or "direct-messages" if you create a dedicated channel
    {
      type: "direct.message",
      from: ctx.meta.userId,
      text: data.text
    }
  );
});
```

**Best Practices for 1-to-1 Messaging:**

1. **Use the default channel**: Most users are subscribed to `"default"` by default, making it the most reliable channel for direct messages
2. **Handle delivery failures**: Check the return value to see if the message was delivered (returns number of sessions that received it)
3. **Consider multi-device users**: Messages are sent to all sessions of the target user, which is usually desired behavior
4. **Same Actor requirement**: Users must be in the same Actor instance - if you need cross-Actor messaging, use RPC or external messaging systems

**Important Notes:**

- If the target user is not subscribed to the channel being used, the message won't be delivered (returns 0)
- Messages are sent to all active sessions of the target user, not just one session
- Both users must be connected to the same Actor instance for this to work
- For cross-Actor messaging (users in different rooms), use RPC calls between Actors or external messaging systems

### Actor-Level Emits (`actor.emit`)

Available on the Actor instance for broadcasting to channels.

#### Broadcast to Default Channel

Broadcast to all connections in the default channel:

```typescript
room.on("announcement", (ctx, data) => {
  // Broadcast to default channel
  const sentCount = ctx.actor.emit.emit("announcement", {
    message: data.message
  });
  console.log(`Sent to ${sentCount} connections`);
});
```

#### Broadcast to Specific Channel

Broadcast to a specific channel:

```typescript
room.on("game.update", (ctx, data) => {
  // Broadcast to "game-state" channel
  const sentCount = ctx.actor.emit.to("game-state").emit("game.update", {
    state: data.state
  });
  console.log(`Sent to ${sentCount} connections`);
});
```

**Return Value**: Actor-level emits return the number of connections that received the message.

### Broadcast Options

When using the legacy `broadcast()` method or RPC, you can filter by additional criteria:

```typescript
// Filter by user IDs
ctx.actor.broadcast("default", data, {
  userIds: ["alice", "bob"]
});

// Filter by client IDs
ctx.actor.broadcast("default", data, {
  clientIds: ["client-123", "client-456"]
});

// Exclude specific WebSocket (only available in direct calls, not RPC)
ctx.actor.broadcast("default", data, {
  except: ctx.ws
});
```

**Note**: The `except` option is not available over RPC since WebSocket objects cannot be serialized.

### Implementation Details

**Socket Emit**: [src/actor/runtime/emit.ts](../src/actor/runtime/emit.ts) `createSocketEmit()`
- Creates emit API for a specific connection context
- Determines if `to()` target is a channel or userId by checking `ctx.meta.channels`
- Uses `sendToUser()` for userId targets or `broadcast()` for channel targets

**Actor Emit**: [src/actor/runtime/emit.ts](../src/actor/runtime/emit.ts) `createActorEmit()`
- Creates emit API for actor-level broadcasting
- Always uses `broadcast()` for channel targeting

**Broadcast**: [src/actor/runtime/broadcast.ts](../src/actor/runtime/broadcast.ts)
- Filters sessions by channel subscription (`meta.channels.includes(channel)`)
- Applies optional filters (userIds, clientIds, except)
- Automatically cleans up stale/closed connections
- Returns count of successful sends

**SendToUser**: [src/actor/runtime/sendToUser.ts](../src/actor/runtime/sendToUser.ts)
- Sends to all sessions of a user that are subscribed to the specified channel
- Filters by `meta.userId === userId && meta.channels.includes(channel)`
- Automatically cleans up failed sessions

## Client-Side Emits

The Verani client provides methods for sending messages to the server and listening for incoming messages.

### Sending Messages

Use `client.emit()` to send messages to the server:

```typescript
const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Send a message
client.emit("chat.message", {
  text: "Hello, world!"
});

// Send without data
client.emit("ping");
```

**Message Queueing**: If the client is not connected, messages are automatically queued and sent when the connection is established. See [src/client/client.ts](../src/client/client.ts) `emit()` method lines 222-242.

### Receiving Messages

Register event listeners to receive messages from the server:

```typescript
// Register a listener
client.on("chat.message", (data) => {
  console.log("Received:", data);
});

// One-time listener
client.once("welcome", (data) => {
  console.log("Welcome message:", data);
});

// Remove a listener
const handler = (data) => console.log(data);
client.on("event", handler);
client.off("event", handler);
```

**Event Dispatching**: When a message is received, the client decodes the frame and dispatches it to listeners based on the event type. See [src/client/runtime/onWebSocketMessage.ts](../src/client/runtime/onWebSocketMessage.ts) for implementation.

### Channel-Based Message Handling

Since channels are handled server-side, clients receive messages based on their channel subscriptions. The client doesn't need to know about channels - it just listens for events:

```typescript
// Client subscribes to "game-state" channel (handled server-side)
// Client receives messages broadcast to that channel
client.on("game.update", (data) => {
  // This will only fire if the client is subscribed to the channel
  // that received the broadcast
  updateGameState(data);
});
```

## Message Protocol

All messages in Verani are wrapped in a `MessageFrame` structure for transmission over WebSocket.

### Message Frame Structure

```typescript
interface MessageFrame {
  type: string;        // Message type ("event", "ping", "pong", etc.)
  channel?: string;    // Optional channel name
  data?: any;          // Optional message data
}
```

**Protocol Implementation**: [src/shared/types.ts](../src/shared/types.ts), [src/shared/encode.ts](../src/shared/encode.ts), [src/shared/decode.ts](../src/shared/decode.ts)

### Message Flow

#### Client → Server

```
1. Client calls: client.emit("eventName", data)
2. Encoded as MessageFrame: { type: "eventName", data: {...} }
3. Sent via WebSocket as JSON string
4. Server receives raw WebSocket message
5. Decoded to MessageFrame
6. Routed to event handler or onMessage hook
```

**Client Encoding**: [src/client/protocol.ts](../src/client/protocol.ts) `encodeClientMessage()`
**Server Decoding**: [src/actor/protocol.ts](../src/actor/protocol.ts) `decodeFrame()`

#### Server → Client

```
1. Server calls: ctx.actor.emit.to("channel").emit("event", data)
2. Wrapped in MessageFrame: { type: "event", channel: "channel", data: { type: "event", ...data } }
3. Encoded to JSON string
4. Filtered by channel subscription
5. Sent to matching WebSocket connections
6. Client receives and decodes MessageFrame
7. Extracts event type from data.type
8. Dispatched to registered listeners
```

**Server Encoding**: [src/actor/protocol.ts](../src/actor/protocol.ts) `encodeFrame()`
**Client Decoding**: [src/client/runtime/onWebSocketMessage.ts](../src/client/runtime/onWebSocketMessage.ts) lines 15-40

### Event Wrapping

Server emits wrap the actual event data in a nested structure:

```typescript
// Server emits:
ctx.actor.emit.to("default").emit("chat.message", { text: "Hello" });

// Sent as MessageFrame:
{
  type: "event",
  channel: "default",
  data: {
    type: "chat.message",  // Actual event type
    text: "Hello"
  }
}
```

The client unwraps this to extract the actual event type from `data.type` before dispatching to listeners. See [src/client/runtime/onWebSocketMessage.ts](../src/client/runtime/onWebSocketMessage.ts) lines 33-38.

## Examples

### Server Examples

#### Socket Emit to Current Connection

```typescript
room.on("ping", (ctx, data) => {
  // Send response only to sender
  ctx.emit.emit("pong", { timestamp: Date.now() });
});
```

#### Socket Emit to Channel (Excluding Sender)

```typescript
room.on("chat.message", (ctx, data) => {
  // Broadcast to channel, excluding sender
  ctx.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });
});
```

#### Socket Emit to User (1-to-1 Messaging)

```typescript
room.on("private.message", (ctx, data) => {
  // Send to specific user (all their sessions)
  // Both users must be in same Actor and subscribed to common channel
  const sentCount = ctx.emit.to(data.targetUserId).emit("private.message", {
    from: ctx.meta.userId,
    text: data.text,
    timestamp: Date.now()
  });

  // Optional: Notify sender if message wasn't delivered
  if (sentCount === 0) {
    ctx.emit.emit("error", {
      message: "User not available or not in same channel"
    });
  } else {
    // Confirm delivery to sender
    ctx.emit.emit("message.sent", {
      to: data.targetUserId,
      timestamp: Date.now()
    });
  }
});
```

#### Actor Emit to Default Channel

```typescript
room.on("announcement", (ctx, data) => {
  // Broadcast to all connections in default channel
  const count = ctx.actor.emit.emit("announcement", {
    message: data.message,
    from: "admin"
  });
  console.log(`Announcement sent to ${count} connections`);
});
```

#### Actor Emit to Specific Channel

```typescript
room.on("game.state", (ctx, data) => {
  // Broadcast to game-state channel
  ctx.actor.emit.to("game-state").emit("game.state", {
    state: data.state,
    players: data.players
  });
});
```

#### Broadcast with Filtering Options

```typescript
room.on("admin.broadcast", (ctx, data) => {
  // Broadcast to specific users only
  ctx.actor.broadcast("default", {
    type: "admin.message",
    message: data.message
  }, {
    userIds: data.targetUserIds
  });
});
```

### Client Examples

#### Sending Messages

```typescript
const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Send chat message
client.emit("chat.message", {
  text: "Hello, world!"
});

// Send ping
client.emit("ping");

// Messages are queued if not connected
client.emit("queued.message", { data: "will send when connected" });
```

#### Receiving Messages

```typescript
const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Listen for chat messages
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});

// Listen for game updates
client.on("game.update", (data) => {
  updateGameUI(data);
});

// One-time welcome message
client.once("welcome", (data) => {
  console.log("Welcome:", data.message);
});
```

#### 1-to-1 Messaging

```typescript
const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Send a direct message to another user
function sendDirectMessage(targetUserId, text) {
  client.emit("private.message", {
    targetUserId: targetUserId,
    text: text
  });
}

// Listen for incoming direct messages
client.on("private.message", (data) => {
  console.log(`Direct message from ${data.from}: ${data.text}`);
  // Display in UI
  displayDirectMessage(data.from, data.text, data.timestamp);
});

// Handle message delivery confirmation
client.on("message.sent", (data) => {
  console.log(`Message delivered to ${data.to}`);
});

// Handle delivery errors
client.on("error", (data) => {
  console.error("Message error:", data.message);
});

// Example usage
sendDirectMessage("bob", "Hello Bob! How are you?");
```

**Important**: For 1-to-1 messaging to work, both users must:
- Be connected to the same Actor instance (same room)
- Be subscribed to a common channel (usually "default")

#### Channel-Based Message Handling

```typescript
// Server handles channel subscription
// Client just listens for events

const client = new VeraniClient("wss://example.com/ws?userId=alice");

// Join a channel (server-side)
client.emit("channel.join", { channel: "game-state" });

// Listen for channel-specific events
client.on("game.update", (data) => {
  // Only receives if subscribed to the channel that broadcast this
  updateGameState(data);
});

client.on("chat.message", (data) => {
  // Receives messages from channels this client is subscribed to
  addChatMessage(data);
});
```

## Key Implementation Files

- **Server emit logic**: [src/actor/runtime/emit.ts](../src/actor/runtime/emit.ts)
  - `createSocketEmit()` - Socket-level emit API
  - `createActorEmit()` - Actor-level emit API

- **Broadcast logic**: [src/actor/runtime/broadcast.ts](../src/actor/runtime/broadcast.ts)
  - Channel filtering and session management

- **SendToUser logic**: [src/actor/runtime/sendToUser.ts](../src/actor/runtime/sendToUser.ts)
  - User-targeted message delivery

- **Client emit**: [src/client/client.ts](../src/client/client.ts)
  - `emit()` method with message queueing

- **Client message handling**: [src/client/runtime/onWebSocketMessage.ts](../src/client/runtime/onWebSocketMessage.ts)
  - Message decoding and event dispatching

- **Protocol**:
  - [src/shared/types.ts](../src/shared/types.ts) - MessageFrame types
  - [src/shared/encode.ts](../src/shared/encode.ts) - Message encoding
  - [src/shared/decode.ts](../src/shared/decode.ts) - Message decoding

## Related Documentation

- [Actors and Channels](./actors-channels.md) - Core Actor and Channel concepts
- [Examples - Channels](../examples/channels.md) - Practical channel examples
- [RPC](./rpc.md) - RPC-based emits from Workers
- [Lifecycle](./lifecycle.md) - Connection lifecycle hooks
- [Architecture](./architecture.md) - System architecture overview

