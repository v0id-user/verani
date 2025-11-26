# Verani Examples

Working examples demonstrating Verani's real-time capabilities.

## Examples

### 💬 Chat Room
**Path**: `/chat` (WebSocket) | `/chat.html` (Client)

Real-time chat application with:
- Message broadcasting
- Typing indicators
- Online user list
- Join/leave notifications
- Multi-user support

### 👥 Presence Tracking
**Path**: `/presence` (WebSocket) | `/presence.html` (Client)

Track who's online with:
- Real-time presence updates
- Multi-device support (same user, multiple tabs)
- Status indicators (online/away/busy)
- Device count per user
- Join/leave animations

### 🔔 Notifications Feed
**Path**: `/notifications` (WebSocket) | `/notifications.html` (Client)

Personal notification stream with:
- Per-user notification feed (1 Actor per user)
- Push notifications
- Read/unread tracking
- Multi-device synchronization
- Toast notifications

## Running Locally

### 1. Install Dependencies

```bash
npm install
# or
bun install
```

### 2. Start Development Server

```bash
npm run dev
# or
wrangler dev
```

The server will start at `http://localhost:8787`

### 3. Open Examples

- **Landing Page**: `http://localhost:8787/`
- **Chat**: `http://localhost:8787/chat.html`
- **Presence**: `http://localhost:8787/presence.html`
- **Notifications**: `http://localhost:8787/notifications.html`

### 4. Test Multi-User

Open multiple browser tabs with different usernames to see real-time synchronization!

**Username format**: `user:yourname`

Examples:
- `user:alice`
- `user:bob`
- `user:charlie`

## Architecture

### WebSocket Routing

`src/index.ts` routes requests based on path:

```
/chat          → chatHandler (chatRoom Actor)
/presence      → presenceHandler (presenceRoom Actor)
/notifications → notificationsHandler (notificationsRoom Actor)
```

### Room Definitions

Each example is defined as a Verani room in `examples/`:

- **`chat-room.ts`**: Chat room with message broadcasting
- **`presence-room.ts`**: Presence tracking with multi-device support
- **`notifications-room.ts`**: Personal notification feed

### HTML Clients

Interactive HTML clients in `examples/clients/`:

- **`chat.html`**: Chat interface with message list and typing indicator
- **`presence.html`**: User grid showing online status
- **`notifications.html`**: Notification feed with read/unread tracking

## Authentication

All examples use simple token-based authentication:

**Token format**: `user:username`

This is for **demonstration purposes only**. In production:

1. Use proper JWT verification (see [`SECURITY.md`](../docs/SECURITY.md))
2. Verify token signatures
3. Check expiration
4. Validate user permissions

### Example Production Auth

```typescript
import jwt from "@tsndr/cloudflare-worker-jwt";

export const secureRoom = defineRoom({
  async extractMeta(req) {
    const token = new URL(req.url).searchParams.get("token");
    
    if (!token) {
      throw new Error("Unauthorized");
    }

    // Verify JWT signature
    const isValid = await jwt.verify(token, SECRET_KEY);
    if (!isValid) {
      throw new Error("Invalid token");
    }

    const payload = jwt.decode(token);
    
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"]
    };
  }
});
```

## Deployment

### 1. Update `wrangler.toml`

```toml
name = "verani-examples"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "CHAT"
class_name = "VeraniActorImpl"
script_name = "verani-examples"

[[durable_objects.bindings]]
name = "PRESENCE"
class_name = "VeraniActorImpl"
script_name = "verani-examples"

[[durable_objects.bindings]]
name = "NOTIFICATIONS"
class_name = "VeraniActorImpl"
script_name = "verani-examples"

[[migrations]]
tag = "v1"
new_classes = ["VeraniActorImpl"]
```

### 2. Deploy to Cloudflare

```bash
npx wrangler deploy
```

Your examples will be available at:
```
https://verani-examples.your-subdomain.workers.dev
```

## Customization

### Add Your Own Example

1. **Create room definition** in `examples/your-room.ts`:

```typescript
import { defineRoom } from "../src/verani";

export const yourRoom = defineRoom({
  name: "your-example",
  
  onConnect(ctx) {
    // Handle connection
  },
  
  onMessage(ctx, frame) {
    // Handle messages
  },
  
  onDisconnect(ctx) {
    // Handle disconnection
  }
});
```

2. **Add route** in `src/index.ts`:

```typescript
import { yourRoom } from "../examples/your-room";

const yourHandler = createActorHandler(yourRoom);

// In fetch():
if (path.startsWith("/your-route")) {
  return yourHandler.fetch(request, env, ctx);
}
```

3. **Create HTML client** in `examples/clients/your-room.html`

4. **Add to landing page** in `src/index.ts` `getIndexHTML()`

## Features Demonstrated

### Core Verani Features

✅ **Connection Lifecycle**
- `onConnect`, `onMessage`, `onDisconnect` hooks
- Connection metadata extraction
- Session management

✅ **Broadcasting**
- Broadcast to all connections
- Broadcast with filters (`except`, `userIds`)
- Channel-based routing

✅ **Hibernation Support**
- WebSocket attachment persistence
- Session restoration on wake
- Automatic state recovery

✅ **Multi-Device Support**
- Same user, multiple connections
- Device tracking
- Cross-device synchronization

### Best Practices

✅ **Error Handling**
- Try-catch around user hooks
- Generic error messages to clients
- Detailed server logging

✅ **Input Validation**
- Message type validation
- Data validation
- Length limits

✅ **Real-Time UX**
- Optimistic updates
- Loading states
- Toast notifications
- Sound effects

## Troubleshooting

### WebSocket Not Connecting

1. Check console for errors
2. Verify token format: `user:username`
3. Check server is running: `wrangler dev`
4. Use `ws://` for localhost, `wss://` for production

### Messages Not Appearing

1. Check WebSocket state in DevTools → Network → WS
2. Verify message format in console
3. Check server logs: `wrangler tail`

### Presence Not Updating

1. Make sure you're using same username in multiple tabs
2. Check device count is incrementing
3. Verify presence messages in WebSocket inspector

## Next Steps

- **[Getting Started](../docs/GETTING_STARTED.md)** - Build your first app
- **[API Reference](../docs/API.md)** - Complete API docs
- **[Security Guide](../docs/SECURITY.md)** - Production security
- **[Deployment Guide](../docs/DEPLOYMENT.md)** - Deploy to Cloudflare

## License

ISC

