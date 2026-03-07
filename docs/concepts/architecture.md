# Architecture

How Verani works under the hood.

## Simple Idea

**Make realtime on Cloudflare feel like Socket.io.**

If you know Socket.io, you already know Verani. The difference: Verani handles Cloudflare Actor hibernation correctly and scales horizontally.

## Architecture

Each user gets their own Durable Object (ConnectionDO), with separate coordination DOs (RoomDO) for shared state.

```
Client A ─► ConnectionDO(userA) ─┐
                                 ├─► RoomDO("chat") ─► (membership + RPC fanout)
Client B ─► ConnectionDO(userB) ─┤
                                 │
Client C ─► ConnectionDO(userC) ─┴─► RoomDO("presence") ─► (coordination)
```

**Key properties:**
- No single-threaded bottleneck
- Horizontal scalability (each user = their own DO)
- Cost-efficient (idle connections hibernate)
- Message delivery via efficient RPC
- Shared state in dedicated coordination DOs

**Use `createConnectionHandler()` and `createRoomHandler()` to set up this architecture.**

## Per-Connection Flow

### Connection Setup

```
1. Client connects to Worker
2. Worker extracts userId from request
3. Worker routes to ConnectionDO.get(userId)
4. ConnectionDO owns the single WebSocket
5. ConnectionDO joins RoomDOs as needed
```

### Message Flow (User-to-User via Room)

```
Client A sends message
    ↓
ConnectionDO(A) receives via WebSocket
    ↓
ConnectionDO(A) calls RoomDO.broadcast(event, data)
    ↓
RoomDO iterates members
    ↓
RoomDO calls ConnectionDO(B).deliverMessage(event, data) via RPC
    ↓
ConnectionDO(B) sends to its WebSocket
    ↓
Client B receives message
```

### Direct Messaging (User-to-User)

```
Client A sends { type: "dm", toUserId: "B", text: "Hi" }
    ↓
ConnectionDO(A) receives message
    ↓
ConnectionDO(A) calls ConnectionDO(B).deliverMessage(...) via RPC
    ↓
ConnectionDO(B) sends to its WebSocket
    ↓
Client B receives DM
```

## Durable Object Topology

### ConnectionDO (One Per User)

- **Identity:** `ConnectionDO.get(userId)`
- **Owns:**
  - Single WebSocket connection (hibernatable)
  - Minimal session metadata
  - Room membership (persisted)
- **RPC Methods:**
  - `deliverMessage(event, data)` - receive from other DOs
  - `joinRoom(roomName)` / `leaveRoom(roomName)`

### RoomDO (One Per Room/Channel)

- **Identity:** `RoomDO.get(roomName)`
- **Owns:**
  - Member list (Set of userIds)
  - Shared room state
  - No WebSocket connections
- **RPC Methods:**
  - `join(userId)` / `leave(userId)`
  - `broadcast(event, data)` - fan out to members

## Error Handling

- User hooks wrapped in try-catch
- Errors logged with `[Verani]` prefix
- Optional `onError` hook for custom handling
- Client never sees server errors (security)
- Automatic recovery when possible

## Design Principles

1. **Per-user isolation** - Each user has their own DO
2. **RPC for coordination** - DOs communicate via RPC, not shared state
3. **Hibernation-friendly** - State automatically persisted and restored
4. **No global bottleneck** - Horizontal scaling by design
5. **JSON only** - Binary protocols are future work

## When to Use Verani

**Use Verani when:**
- You're on Cloudflare Workers/Pages
- You want Socket.io-like simplicity
- You need automatic hibernation handling
- You need horizontal scalability

**Consider alternatives when:**
- You need guaranteed ordering (use queues)
- You're not on Cloudflare (use Socket.io, Ably, etc.)

## Related

- [Actors and Channels](./actors-channels.md)
- [Hibernation](./hibernation.md)
- [RPC](./rpc.md)
