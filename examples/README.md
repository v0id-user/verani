# Verani Examples

Working examples demonstrating Verani's real-time capabilities.

## Examples

### 💬 Chat Room
**Server**: `/chat` (WebSocket) | **Client**: `chat-client.ts`

Real-time chat application with:
- Message broadcasting
- Typing indicators
- Online user list
- Join/leave notifications
- Multi-user support
- Interactive CLI interface

**Usage**:
```bash
bun run examples/clients/chat-client.ts user:alice
```

### 👥 Presence Tracking
**Server**: `/presence` (WebSocket) | **Client**: `presence-client.ts`

Track who's online with:
- Real-time presence updates
- Multi-device support (same user, multiple terminals)
- Status indicators (online/away/busy)
- Device count per user
- Live updating dashboard

**Usage**:
```bash
bun run examples/clients/presence-client.ts user:bob
```

### 🔔 Notifications Feed
**Server**: `/notifications` (WebSocket) | **Client**: `notifications-client.ts`

Personal notification stream with:
- Per-user notification feed (1 Actor per user)
- Push notifications
- Read/unread tracking
- Multi-device synchronization
- Interactive command menu

**Usage**:
```bash
bun run examples/clients/notifications-client.ts user:charlie
```

## Running Locally

### 1. Install Dependencies

With npm:
```bash
npm install
```

With Bun (faster! ⚡):
```bash
bun install
```

### 2. Start Development Server

With npm:
```bash
npm run dev
```

With Bun:
```bash
bun run dev
```

Or directly with Wrangler:
```bash
wrangler dev
# or
bunx wrangler dev
```

The server will start at `http://localhost:8787`

### 3. Run Client Examples

In a new terminal, run any of the TypeScript client examples:

**Chat Client**:
```bash
bun run examples/clients/chat-client.ts user:alice
```

**Presence Client**:
```bash
bun run examples/clients/presence-client.ts user:bob
```

**Notifications Client**:
```bash
bun run examples/clients/notifications-client.ts user:charlie
```

### 4. Test Multi-User

Open multiple terminals with different usernames to see real-time synchronization!

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

### TypeScript Clients

Interactive CLI clients using the VeraniClient SDK in `examples/clients/`:

- **`chat-client.ts`**: Interactive chat with readline input and colored output
- **`presence-client.ts`**: Real-time presence dashboard with live updates
- **`notifications-client.ts`**: Notification feed with command menu

These clients demonstrate proper SDK usage including:
- Connection lifecycle management (`onOpen`, `onClose`, `onError`, `onStateChange`)
- Event listening (`client.on()`) and emitting (`client.emit()`)
- Automatic reconnection handling
- Message queueing when disconnected
- State management and UI updates

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
# or
bunx wrangler deploy
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

3. **Create TypeScript client** in `examples/clients/your-client.ts`:

```typescript
import { VeraniClient } from "../../src/client/client";

const client = new VeraniClient("ws://localhost:8787/ws/your-route?token=user:test");

client.onOpen(() => {
  console.log("Connected!");
});

client.on("your.event", (data) => {
  console.log("Received:", data);
});

client.emit("your.action", { /* data */ });
```

## Features Demonstrated

### Core Verani Features (Server-Side)

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

### SDK Features (Client-Side)

✅ **VeraniClient Usage**
- WebSocket connection management
- Event-based message handling (`on`, `emit`, `once`, `off`)
- Automatic reconnection with exponential backoff
- Connection state tracking (`connecting`, `connected`, `disconnected`)
- Message queueing when disconnected

✅ **Lifecycle Callbacks**
- `onOpen()` - Called when connection is established
- `onClose()` - Called when connection closes
- `onError()` - Called on connection errors
- `onStateChange()` - Called on state transitions

✅ **Best Practices**
- Try-catch around user hooks
- Generic error messages to clients
- Detailed server logging
- Input validation
- Interactive CLI interfaces with colored output

## CLI Client Features

Each TypeScript client demonstrates different interaction patterns:

### Chat Client (`chat-client.ts`)
- **Interactive input**: Type messages directly, press Enter to send
- **Typing indicators**: Automatic typing indicator when you type
- **Commands**:
  - `/users` - List all online users
  - `/help` - Show available commands
  - `/quit` - Exit the chat
- **Colored output**: Different colors for your messages vs others
- **Real-time updates**: See messages, joins, and leaves instantly

### Presence Client (`presence-client.ts`)
- **Live dashboard**: Automatically refreshing presence view
- **Multi-device tracking**: Shows device count per user
- **Status indicators**: Visual status with emojis (🟢 online, 🟡 away, 🔴 busy)
- **Stats display**: Total users, connections, and your devices
- **Toast notifications**: Popup notifications when users join/leave

### Notifications Client (`notifications-client.ts`)
- **Interactive menu**: Command-based interface
- **Commands**:
  - `read <id>` - Mark notification as read
  - `read-all` - Mark all as read
  - `delete <id>` - Delete notification
  - `simulate` - Create test notification
  - `refresh` - Refresh display
  - `quit` - Exit
- **Notification types**: Info, success, warning, error
- **Toast popups**: Beautiful notification toasts with borders
- **Sync across devices**: Changes appear on all connected terminals

## Troubleshooting

### WebSocket Not Connecting

1. Check that server is running: `wrangler dev` should be active
2. Verify token format: `user:username`
3. Check the client console output for connection errors
4. Ensure using `ws://` for localhost (not `wss://`)

### Messages Not Appearing

1. Check WebSocket state in the client output
2. Verify message format in console logs
3. Check server logs: `wrangler tail` or check terminal running `wrangler dev`
4. Try running with verbose logging

### Presence Not Updating

1. Make sure you're using the same username in multiple terminals
2. Check device count is incrementing in the display
3. Verify both clients are connected (check connection status)

### Client Crashes or Errors

1. Make sure you have Bun installed: `bun --version`
2. Install dependencies: `bun install` in project root
3. Check that you're passing the token argument correctly
4. Look for TypeScript compilation errors

## Next Steps

- **[Getting Started](../docs/GETTING_STARTED.md)** - Build your first app
- **[API Reference](../docs/API.md)** - Complete API docs
- **[Security Guide](../docs/SECURITY.md)** - Production security
- **[Deployment Guide](../docs/DEPLOYMENT.md)** - Deploy to Cloudflare

## License

ISC

