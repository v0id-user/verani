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

## Step 1: Configure wrangler.toml

Create or update your `wrangler.toml`:

```toml
name = "my-verani-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Durable Object binding
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "VeraniActorImpl"  # The class name from createActorHandler
script_name = "my-verani-app"

# Migration to create the Durable Object
[[migrations]]
tag = "v1"
new_classes = ["VeraniActorImpl"]
```

### Important Notes:

1. **class_name**: This should match the internal class name created by `createActorHandler()`. By default, it's `VeraniActorImpl`.

2. **script_name**: Must match the `name` field at the top of your wrangler.toml.

3. **migrations**: Required for Durable Objects. Increment the tag for each schema change.

## Step 2: Configure WebSocket Routing

Verani needs a WebSocket upgrade endpoint. Update your `src/index.ts`:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

// Create the Actor handler
export default createActorHandler(chatRoom);
```

The Actor handler automatically configures WebSocket upgrades at the `/ws` path.

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

- [ ] Implement authentication (JWT tokens)
- [ ] Validate all client input
- [ ] Rate limit messages per user
- [ ] Sanitize user-generated content
- [ ] Use HTTPS/WSS only
- [ ] Don't expose error details to clients
- [ ] Log security events
- [ ] Set up monitoring and alerts

## Next Steps

- **[API Reference](./API.md)** - Complete API documentation
- **[Examples](./EXAMPLES.md)** - Common patterns
- **[Mental Model](./MENTAL_MODEL.md)** - Architecture deep dive

## Support

- GitHub Issues: [Report bugs](https://github.com/your-org/verani/issues)
- Discussions: [Ask questions](https://github.com/your-org/verani/discussions)
- Discord: [Join community](#) (coming soon)

