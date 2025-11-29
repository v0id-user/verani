# Deployment Guide

How to deploy your Verani application to Cloudflare.

## Prerequisites

- Cloudflare account (free tier works)
- Wrangler CLI installed: `npm install -g wrangler`
- Logged in to Wrangler: `wrangler login`

## Project Structure

Your project should look like this:

```
my-app/
├── src/
│   ├── index.ts          # Actor handler export
│   └── rooms/
│       └── chat.ts       # Room definitions
├── wrangler.toml         # Cloudflare configuration
├── package.json
└── tsconfig.json
```

## Durable Object Export Requirements

**Critical**: Wrangler requires a specific three-way relationship between your code, configuration, and Worker environment:

### The Three-Way Relationship

1. **Export in `src/index.ts`** - The actual Durable Object class:
```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

// Create the Durable Object class
const ChatRoom = createActorHandler(chatRoom);

// Export with a specific name
export { ChatRoom };
```

2. **Configuration in `wrangler.jsonc`** - Must reference the exported class:
```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // MUST match export name exactly
        "name": "CHAT"              // Binding name for env.ChatRoom
      }
    ]
  }
}
```

3. **Environment Binding** - Access in your Worker:
```typescript
interface Env {
  CHAT: DurableObjectNamespace;  // From wrangler.jsonc "name"
}

export default {
  async fetch(request: Request, env: Env) {
    // Use the binding to get a Durable Object instance
    const id = env.ChatRoom.idFromName("room-123");
    const stub = env.ChatRoom.get(id);
    return stub.fetch(request);
  }
};
```

### Common Export Errors

**Error**: `"no such Durable Object class is exported from the worker"`
- **Cause**: Export name doesn't match `class_name` in wrangler.jsonc
- **Fix**: Ensure `export { ChatRoom }` matches `"class_name": "ChatRoom"`

**Error**: `Property 'CHAT' does not exist on type 'Env'`
- **Cause**: Missing TypeScript interface for environment bindings
- **Fix**: Define the `Env` interface with your Durable Object namespace

**Error**: `Generic type 'Actor<E>' requires 1 type argument`
- **Cause**: Incorrect use of the handler wrapper
- **Fix**: Use `createActorHandler()` which returns the properly typed class

## Step 1: Configure wrangler.jsonc

Create or update your `wrangler.jsonc`:

```jsonc
{
  "name": "my-verani-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  "durable_objects": {
    "bindings": [
      {
        "class_name": "ChatRoom",  // MUST match your export name
        "name": "CHAT"              // env.ChatRoom binding
      }
    ]
  },

  "migrations": [
    {
      "new_sqlite_classes": ["ChatRoom"],
      "tag": "v1"
    }
  ]
}
```

### Critical Configuration Notes:

1. **class_name**: MUST exactly match the exported class name in `src/index.ts`
2. **name**: The binding name you'll use in your code (e.g., `env.ChatRoom`)
3. **migrations**: Required for Durable Objects. Increment the tag for schema changes

## Step 2: Export Your Durable Object Class

In your `src/index.ts`, create and export the Durable Object class:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

// Create the Durable Object class
const ChatRoom = createActorHandler(chatRoom);

// Export it - name MUST match wrangler.jsonc class_name
export { ChatRoom };

// Define environment bindings
interface Env {
  CHAT: DurableObjectNamespace;
}

// Export fetch handler for routing
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket connections to the Durable Object
    if (url.pathname.startsWith("/ws")) {
      const id = env.ChatRoom.idFromName("chat-room");
      const stub = env.ChatRoom.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

## Step 3: Configure Actor Routing

You need to tell Cloudflare which requests go to which Actor instance.

### Option A: Single Room (All Users in One Actor)

```typescript
import { Actor } from "@cloudflare/actors";

const handler = createActorHandler(chatRoom);

// Configure Actor
export default handler.configure({
  // All requests go to the same Actor instance
  nameFromRequest: () => "global-chat-room"
});
```

### Option B: Room-Based Routing

```typescript
export default handler.configure({
  // Route by room ID from URL
  nameFromRequest: (req) => {
    const url = new URL(req.url);
    const roomId = url.searchParams.get("roomId") || "default";
    return `room:${roomId}`;
  }
});
```

### Option C: User-Based Routing

```typescript
export default handler.configure({
  // Each user gets their own Actor
  nameFromRequest: (req) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw new Error("userId required");
    }

    return `user:${userId}`;
  }
});
```

## Step 4: Local Development

Test locally before deploying:

```bash
npm run dev
# or
wrangler dev
```

This starts a local server at `http://localhost:8787`.

**Test WebSocket connection:**

```javascript
const ws = new WebSocket("ws://localhost:8787/ws?userId=alice");

ws.onopen = () => {
  console.log("Connected!");
  ws.send(JSON.stringify({ type: "ping" }));
};

ws.onmessage = (e) => {
  console.log("Received:", e.data);
};
```

## Step 5: Deploy to Production

Deploy your Worker:

```bash
wrangler deploy
```

Your app will be available at:
```
https://my-verani-app.your-subdomain.workers.dev
```

WebSocket endpoint:
```
wss://my-verani-app.your-subdomain.workers.dev/ws
```

## Step 6: Custom Domain (Optional)

### Add a Custom Domain

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your Worker
3. Go to Settings → Triggers
4. Add a custom domain (e.g., `chat.example.com`)

### Update Client

```typescript
const client = new VeraniClient(
  "wss://chat.example.com/ws?userId=alice"
);
```

## Environment Variables

To use environment variables:

```toml
# wrangler.toml
[vars]
ENVIRONMENT = "production"
MAX_CONNECTIONS = "1000"

# Secrets (use wrangler secret put)
# JWT_SECRET = "..." (set via CLI)
```

Set secrets:

```bash
wrangler secret put JWT_SECRET
# Enter your secret when prompted
```

Access in code:

```typescript
export const chatRoom = defineRoom({
  extractMeta(req, env) {
    const secret = env.JWT_SECRET;
    // Use for JWT verification
  }
});
```

**Note:** You'll need to modify the Actor handler to pass `env` to your room definition. This is future work.

## Monitoring

### View Logs

Stream real-time logs:

```bash
wrangler tail
```

Filter logs:

```bash
wrangler tail --format pretty
```

### Metrics

View metrics in Cloudflare Dashboard:
- Workers & Pages → Your Worker → Metrics

Key metrics:
- **Requests**: WebSocket upgrade requests
- **Errors**: Connection failures
- **CPU Time**: Processing time per request
- **Duration**: Time Actor stays active

## RPC Considerations

When using RPC methods (calling Actor methods from Workers or other Actors), keep these points in mind:

### Actor ID Consistency

**Critical**: Use the same `idFromName()` value for WebSocket connections and RPC calls to the same Actor instance.

```typescript
// ✅ Correct: Same ID for WebSocket and RPC
const actorId = "chat-room-123";

// WebSocket connection
const id = env.CHAT.idFromName(actorId);
const stub = env.CHAT.get(id);
await stub.fetch(wsRequest);

// RPC call (must use same ID)
const id = env.CHAT.idFromName(actorId); // Same value!
const stub = env.CHAT.get(id);
await stub.sendToUser("alice", "default", data);
```

### Error Handling

RPC calls can fail due to network issues or Actor hibernation. Always wrap in try/catch:

```typescript
try {
  const sentCount = await stub.sendToUser(userId, "default", data);
  return Response.json({ success: true, sentTo: sentCount });
} catch (error) {
  console.error("RPC call failed:", error);
  // Actor might be hibernating - retry or return error
  return Response.json({ 
    success: false, 
    error: "Failed to send message" 
  }, { status: 503 });
}
```

### Performance

- RPC calls have network overhead compared to direct calls
- Batch operations when possible
- Consider caching actor state queries
- Use `Promise.all()` for parallel RPC calls

```typescript
// ✅ Good: Parallel RPC calls
const [count, userIds] = await Promise.all([
  stub.getSessionCount(),
  stub.getConnectedUserIds()
]);

// ❌ Bad: Sequential calls
const count = await stub.getSessionCount();
const userIds = await stub.getConnectedUserIds();
```

## Common Issues

### Issue: "No Durable Object namespace found"

**Solution:** Make sure your `wrangler.toml` has the correct binding:

```toml
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "VeraniActorImpl"
script_name = "my-verani-app"  # Must match name field
```

### Issue: WebSocket connection fails

**Solutions:**

1. Check you're using `wss://` for production (not `ws://`)
2. Verify the `/ws` path is correct
3. Check browser console for errors
4. Run `wrangler tail` to see server-side errors

### Issue: "Actor is not defined"

**Solution:** Import from `@cloudflare/actors`:

```typescript
import { Actor } from "@cloudflare/actors";
```

### Issue: Sessions not restoring after hibernation

**Solution:** Make sure you're using Verani's `storeAttachment()`:

```typescript
// This is automatic in Verani
storeAttachment(ws, metadata);
```

### Issue: RPC calls failing with "Method not found"

**Solutions:**

1. Ensure you're using the stub, not the class directly:
```typescript
// ✅ Correct
const stub = env.CHAT.get(id);
await stub.sendToUser(...);

// ❌ Wrong
await ChatRoom.sendToUser(...);
```

2. Check that you're awaiting the Promise:
```typescript
// ✅ Correct
const count = await stub.getSessionCount();

// ❌ Wrong (forgot await)
const count = stub.getSessionCount();
```

3. Verify Actor ID matches between WebSocket and RPC calls

### Issue: CORS errors in browser

**Solution:** Add CORS headers in Worker:

```typescript
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Your handler
    return handler.fetch(request, env);
  }
};
```

## Performance Tips

### 1. Limit Connections Per Actor

```typescript
onConnect(ctx) {
  const count = ctx.actor.getSessionCount();

  if (count > 1000) {
    ctx.ws.close(1008, "Room is full");
    return;
  }
}
```

### 2. Use Channels for Selective Broadcasting

Instead of broadcasting to everyone:

```typescript
// BAD: Everyone receives, many filter it out
ctx.actor.broadcast("default", data);

// GOOD: Only subscribed users receive
ctx.actor.broadcast("channel-123", data);
```

### 3. Batch Messages

Send multiple updates in one message:

```typescript
// Instead of multiple sends
const updates = [];
updates.push(update1, update2, update3);

ctx.actor.broadcast("default", {
  type: "batch.update",
  updates
});
```

### 4. Enable Hibernation

Verani handles this automatically, but make sure you're not keeping the Actor awake unnecessarily:

- Don't use `setInterval()` in the Actor
- Don't keep long-running promises
- Let the Actor sleep when idle

## Scaling

### Vertical Scaling (Per Actor)

Each Actor can handle:
- ~1,000 WebSocket connections comfortably
- ~10,000 messages/second

Beyond that, split into multiple Actors.

### Horizontal Scaling (Multiple Actors)

Cloudflare automatically scales Actors:
- Each Actor instance runs independently
- Actors are distributed globally
- No cross-Actor coordination needed

**Example:** 1 million users

- User-based routing: 1 million Actors (1 per user)
- Room-based routing: N Actors (1 per room)
- Hybrid: Use both strategies

## Cost Estimation

Cloudflare Workers pricing (as of 2024):

**Free Tier:**
- 100,000 requests/day
- 10ms CPU time per request

**Paid Plan ($5/month):**
- 10 million requests/month included
- $0.50 per million additional requests
- Durable Objects: $0.15 per million requests

**Example Costs:**

| Users | Messages/sec | Monthly Cost |
|-------|--------------|--------------|
| 100   | 10          | Free         |
| 1,000 | 100         | ~$5          |
| 10,000| 1,000       | ~$20         |
| 100,000| 10,000     | ~$100        |

*Estimates only. Actual costs depend on usage patterns.*

## Security Checklist

Before going to production:

- [ ] Implement authentication (JWT tokens) - **See [SECURITY.md](./SECURITY.md)**
- [ ] Validate all client input
- [ ] Rate limit messages per user
- [ ] Sanitize user-generated content
- [ ] Use HTTPS/WSS only (never HTTP/WS)
- [ ] Don't expose error details to clients
- [ ] Log security events
- [ ] Set up monitoring and alerts
- [ ] Verify Origin header to prevent CSWSH attacks
- [ ] Use environment variables for secrets (never commit secrets)

**📖 Read the complete [Security Guide](./SECURITY.md) for implementation details.**

## Next Steps

- **[Security Guide](./SECURITY.md)** - Authentication and security best practices
- **[API Reference](./API.md)** - Complete API documentation
- **[Examples](./EXAMPLES.md)** - Common patterns
- **[Mental Model](./MENTAL_MODEL.md)** - Architecture deep dive

## Support

- GitHub Issues: [Report bugs](https://github.com/your-org/verani/issues)
- Discussions: [Ask questions](https://github.com/your-org/verani/discussions)
- Discord: [Join community](#) (coming soon)

