# Authentication (JWT)

🔒 **Authenticated** - JWT token verification required

This example shows how to properly verify user identity using JWT tokens.

```typescript
import { defineRoom } from "verani";
// npm install @tsndr/cloudflare-worker-jwt
import jwt from "@tsndr/cloudflare-worker-jwt";

interface AuthMeta extends ConnectionMeta {
  username: string;
  role: "user" | "moderator" | "admin";
}

export const secureRoom = defineRoom<AuthMeta>({
  async extractMeta(req) {
    // Get token from query parameter (or Authorization header)
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    // Verify JWT signature and expiration
    // Replace SECRET_KEY with your actual secret from environment
    const isValid = await jwt.verify(token, SECRET_KEY);

    if (!isValid) {
      throw new Error("Unauthorized: Invalid token");
    }

    // Decode verified token
    const payload = jwt.decode(token);

    // Validate required claims
    if (!payload.sub) {
      throw new Error("Unauthorized: Missing user ID");
    }

    // Extract verified user data
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: payload.name || payload.sub,
      role: payload.role || "user"
    };
  },

  onConnect(ctx) {
    // ctx.meta.userId is now VERIFIED and TRUSTED
    console.log(`Verified user ${ctx.meta.username} connected`);
  }
});

// Register event handlers (socket.io-like)
secureRoom.on("mod.kick", (ctx, data) => {
  // Authorization check: Moderator-only actions
  if (ctx.meta.role !== "moderator" && ctx.meta.role !== "admin") {
    ctx.emit.emit("error", { message: "Insufficient permissions" });
    return;
  }

  // Perform kick action
  const { targetUserId } = data;
  // Close target user's connections
  const sessions = ctx.actor.getUserSessions(targetUserId);
  sessions.forEach(ws => ws.close(1008, "Kicked by moderator"));

  // Notify room using emit API
  ctx.actor.emit.to("default").emit("user.kicked", {
    userId: targetUserId,
    by: ctx.meta.userId
  });
});

  onError(error, ctx) {
    console.error(`Auth error for ${ctx.meta.userId}:`, error);
    // Don't expose error details to client
    ctx.ws.send(JSON.stringify({
      type: "error",
      data: { message: "An error occurred" }
    }));
  }
});
```

**Client:**

```typescript
// Step 1: Get JWT token from your auth service
async function login(username, password) {
  const response = await fetch("https://your-api.com/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const { token } = await response.json();
  return token;
}

// Step 2: Connect with verified token
const token = await login("alice", "password123");

const client = new VeraniClient(
  `wss://app.example.com/ws?token=${token}`
);

// Step 3: Handle auth errors
client.onClose((event) => {
  if (event.reason === "Unauthorized") {
    // Token invalid or expired - redirect to login
    window.location.href = "/login";
  }
});

client.on("error", (error) => {
  console.error("Connection error:", error);
});
```

**Important Notes:**

1. **Never** put tokens in localStorage if they contain sensitive data
2. Use short-lived tokens (15-60 minutes)
3. Implement token refresh mechanism
4. Always use WSS (not WS) in production
5. Consider using HttpOnly cookies instead of query params for better security

**See [Security Guide - Authentication](../security/authentication.md) for comprehensive authentication guide.**

## Related Examples

- [Basic Chat](./basic-chat.md) - Simple chat room
- [Rate Limiting](./rate-limiting.md) - Prevent spam
- [RPC](./rpc.md) - Remote Procedure Calls

## Related Documentation

- [Security Guide - Authentication](../security/authentication.md) - Complete authentication guide
- [Security Guide - Authorization](../security/authorization.md) - Role-based access control

