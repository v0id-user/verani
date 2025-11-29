# Architecture

Understanding Verani's architecture and design philosophy.

## Core Philosophy

Verani is designed around one simple idea: **make realtime on Cloudflare feel like Socket.io**.

If you're familiar with Socket.io, you already understand 80% of Verani. The key difference is that Verani is built specifically for Cloudflare's Actor model and handles hibernation correctly.

## Architecture Diagram

```
+-------------------------------------------------------------+
|                   Cloudflare Worker                         |
|                                                             |
|  Request --> nameFromRequest() --> Actor Instance           |
|                                         |                   |
|                                         v                   |
|                      +----------------------+               |
|                      | Verani Actor Runtime |               |
|                      |                      |               |
|                      | onWebSocketConnect   |               |
|                      | onWebSocketMessage   |               |
|                      | onWebSocketDisconnect|               |
|                      | onInit (restore)     |               |
|                      +----------------------+               |
|                                         |                   |
|                                         v                   |
|                      +----------------------+               |
|                      |   Your Room Hooks    |               |
|                      |                      |               |
|                      |   onConnect()        |               |
|                      |   onMessage()        |               |
|                      |   onDisconnect()     |               |
|                      +----------------------+               |
+-------------------------------------------------------------+
                              ^
                              | WebSocket
                              |
                      +----------------+
                      | VeraniClient   |
                      |                |
                      | emit()         |
                      | on()           |
                      | reconnect()    |
                      +----------------+
```

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

## Related Documentation

- [Actors and Channels](./actors-channels.md) - Core concepts
- [Hibernation](./hibernation.md) - Hibernation behavior
- [State Management](./state-management.md) - State types
- [RPC](./rpc.md) - Remote Procedure Calls

