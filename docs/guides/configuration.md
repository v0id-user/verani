# Configuration Guide

How to configure your Verani application for Cloudflare Workers.

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

3. **Usage in your Worker** - Access the Actor directly:
```typescript
export default {
  async fetch(request: Request, env: Env) {
    // Use the exported class directly (variable name must match wrangler.jsonc class_name)
    const stub = ChatRoom.get("room-123");
    return stub.fetch(request);
  }
};
```

### Common Export Errors

**Error**: `"no such Durable Object class is exported from the worker"`
- **Cause**: Export name doesn't match `class_name` in wrangler.jsonc
- **Fix**: Ensure `export { ChatRoom }` matches `"class_name": "ChatRoom"`

**Error**: `Cannot find name 'ChatRoom'`
- **Cause**: Missing export or import of the Actor handler class
- **Fix**: Ensure you've exported the class: `export { ChatRoom };` and imported it where needed

**Error**: `Generic type 'Actor<E>' requires 1 type argument`
- **Cause**: Incorrect use of the handler wrapper
- **Fix**: Use `createActorHandler()` which returns the properly typed class

## Configure wrangler.jsonc

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

1. **class_name**: MUST exactly match the exported variable name in `src/index.ts`
2. **name**: Optional binding name (not needed when using direct class method)
3. **migrations**: Required for Durable Objects. Increment the tag for schema changes

## Export Your Durable Object Class

In your `src/index.ts`, create and export the Durable Object class:

```typescript
import { createActorHandler } from "verani";
import { chatRoom } from "./rooms/chat";

// Create the Durable Object class
const ChatRoom = createActorHandler(chatRoom);

// Export it - name MUST match wrangler.jsonc class_name
export { ChatRoom };

// Export fetch handler for routing
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket connections to the Durable Object
    if (url.pathname.startsWith("/ws")) {
      const stub = ChatRoom.get("chat-room");
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
```

## Configure Actor Routing

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

## Common Configuration Issues

### Issue: "No Durable Object namespace found"

**Solution:** Make sure your `wrangler.toml` has the correct binding:

```toml
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "VeraniActorImpl"
script_name = "my-verani-app"  # Must match name field
```

### Issue: "Actor is not defined"

**Solution:** Import from `@cloudflare/actors`:

```typescript
import { Actor } from "@cloudflare/actors";
```

## Related Documentation

- [Deployment Guide](./deployment.md) - How to deploy your application
- [Server API](../api/server.md) - Server-side API reference
- [Quick Start](../getting-started/quick-start.md) - Step-by-step tutorial

