# Examples

Common usage patterns and recipes for Verani.

## Architecture Options

Verani supports two architectures:

### Per-Connection Architecture (Recommended)

Each user gets their own Durable Object. See `examples/v2/` in the repository:

- `presence-connection.ts` - Per-user presence connection handler
- `presence-room-coordinator.ts` - Room coordinator for presence

Use `createConnectionHandler()` and `createRoomHandler()` for this pattern.

### Legacy Architecture

All connections in a single Durable Object. The examples below use this pattern.

Use `defineRoom()` and `createActorHandler()` for this pattern.

## Authentication Note

Examples marked with:
- **Public** - No authentication required (anyone can connect)
- **Authenticated** - Requires token verification
- **Authorized** - Requires authentication + role/permission checks

**For production apps**, always use authenticated examples. See [Security Guide - Authentication](../security/authentication.md) for implementation details.

## Legacy Examples

- [Basic Chat Room](./basic-chat.md) - Simple chat room example
- [Socket.io-like API](./socket-io-like.md) - Event handlers and emit API
- [Channels](./channels.md) - Custom WebSocket paths and multiple channels
- [User Presence](./presence.md) - Track who is online
- [State Persistence](./persistence.md) - Persist room state across hibernation
- [Authentication](./authentication.md) - JWT token verification
- [Rate Limiting](./rate-limiting.md) - Prevent spam with rate limits
- [RPC](./rpc.md) - Send messages via Remote Procedure Calls

## Related Documentation

- [Quick Start Guide](../getting-started/quick-start.md) - Step-by-step tutorial
- [API Reference](../api/server.md) - Complete API documentation
- [Security Guide](../security/authentication.md) - Authentication and security

