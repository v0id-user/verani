# Architecture

How Verani works under the hood.

## Simple Idea

**Make realtime on Cloudflare feel like Socket.io.**

If you know Socket.io, you already know Verani. The difference: Verani handles Cloudflare Actor hibernation correctly.

## How It Works

```
Client (VeraniClient)
    ↓ WebSocket
Cloudflare Worker
    ↓ Routes to Actor
Durable Object (Actor)
    ↓ Calls your hooks
Your Room Code
```

## Message Flow

**Client → Server:**
```
client.emit("event", data)
  → JSON encode
  → WebSocket send
  → Actor receives
  → Call onMessage(ctx, frame)
  → Your handler runs
```

**Server → Client:**
```
ctx.actor.emit.to("channel").emit("event", data)
  → Filter sessions by channel/userId
  → JSON encode
  → WebSocket send to each session
  → Client receives
  → Dispatch to listeners
```

## Error Handling

- User hooks wrapped in try-catch
- Errors logged with `[Verani]` prefix
- Optional `onError` hook for custom handling
- Client never sees server errors (security)
- Automatic recovery when possible

## What Verani Is Simple About

1. **No global user registry** - You manage routing
2. **No cross-actor messaging** - Each Actor is independent
3. **No ordering guarantees** - WebSockets are unordered
4. **No message persistence** - Messages are ephemeral
5. **JSON only** - Binary protocols are future work

These constraints keep Verani simple and predictable.

## When to Use Verani

**Use Verani when:**
- You're on Cloudflare Workers/Pages
- You want Socket.io-like simplicity
- You need automatic hibernation handling
- Your rooms are independent

**Consider alternatives when:**
- You need cross-room messaging (use Cloudflare Pub/Sub)
- You need guaranteed ordering (use queues)
- You're not on Cloudflare (use Socket.io, Ably, etc.)

## Related

- [Actors and Channels](./actors-channels.md)
- [Hibernation](./hibernation.md)
- [RPC](./rpc.md)
