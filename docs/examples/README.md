# Examples

Common usage patterns and recipes for Verani.

## Authentication Note

Examples marked with:
- 🔓 **Public** - No authentication required (anyone can connect)
- 🔒 **Authenticated** - Requires token verification
- 🔐 **Authorized** - Requires authentication + role/permission checks

**For production apps**, always use authenticated examples. See [Security Guide - Authentication](../security/authentication.md) for implementation details.

## Examples

- [Basic Chat Room](./basic-chat.md) 🔓 - Simple chat room example
- [Channels](./channels.md) 🔓 - Custom WebSocket paths and multiple channels
- [User Presence](./presence.md) 🔓 - Track who is online
- [Authentication](./authentication.md) 🔒 - JWT token verification
- [Rate Limiting](./rate-limiting.md) 🔓 - Prevent spam with rate limits
- [RPC](./rpc.md) 🔒 - Send messages via Remote Procedure Calls

## Related Documentation

- [Quick Start Guide](../getting-started/quick-start.md) - Step-by-step tutorial
- [API Reference](../api/server.md) - Complete API documentation
- [Security Guide](../security/authentication.md) - Authentication and security

