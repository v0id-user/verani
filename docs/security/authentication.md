# Authentication

Authentication verifies **who the user is**. Verani handles authentication in the `extractMeta` function.

## Overview

Authentication verifies **who the user is**. Verani handles authentication in the `extractMeta` function.

## Public Rooms (No Authentication)

```typescript
export const publicRoom = defineRoom({
  name: "public-room",
  websocketPath: "/ws"
  // Uses default extractMeta
  // userId comes from query param, completely untrusted
});
```

**⚠️ Security Risks:**
- Users can impersonate anyone
- No accountability
- Vulnerable to abuse

**✅ Use for:**
- Public demos
- Anonymous chat rooms
- Read-only public feeds
- MVP/prototypes

## JWT Authentication (Recommended)

### Step 1: Client Gets Token

```typescript
// Your auth service issues JWT
const response = await fetch("https://your-api.com/login", {
  method: "POST",
  body: JSON.stringify({ username, password })
});

const { token } = await response.json();
```

### Step 2: Client Connects with Token

```typescript
// Option A: Query parameter (less secure)
const client = new VeraniClient(
  `wss://your-app.dev/ws?token=${token}`
);

// Option B: In first message (more secure, but custom)
const client = new VeraniClient(`wss://your-app.dev/ws`);
await client.waitForConnection();
client.emit("auth", { token });
```

**Note**: WebSocket constructor doesn't support custom headers in browsers. For maximum security, use a separate HTTP endpoint to exchange token for a session ID, then connect with that session ID.

### Step 3: Server Verifies Token

```typescript
import { defineRoom } from "verani";

// You'll need a proper JWT library
// npm install @tsndr/cloudflare-worker-jwt
import jwt from "@tsndr/cloudflare-worker-jwt";

interface AuthMeta extends ConnectionMeta {
  email: string;
  role: string;
  verified: boolean;
}

export const secureRoom = defineRoom<AuthMeta>({
  async extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Authentication required");
    }

    // Verify JWT signature and expiration
    const isValid = await jwt.verify(token, SECRET_KEY);

    if (!isValid) {
      throw new Error("Invalid token");
    }

    const payload = jwt.decode(token);

    // Verify required claims
    if (!payload.sub || !payload.exp) {
      throw new Error("Invalid token claims");
    }

    // Check expiration (jwt.verify should do this, but double-check)
    if (payload.exp < Date.now() / 1000) {
      throw new Error("Token expired");
    }

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      email: payload.email,
      role: payload.role || "user",
      verified: true
    };
  },

  onConnect(ctx) {
    // Now you can trust ctx.meta.userId
    console.log(`Verified user ${ctx.meta.userId} connected`);
    
    // Send welcome message using emit API
    ctx.emit.emit("welcome", {
      message: `Welcome, ${ctx.meta.email}!`
    });
  }
});
```

## Session-Based Authentication

If you have session cookies:

```typescript
export const sessionRoom = defineRoom({
  name: "session-room",
  websocketPath: "/ws",
  
  async extractMeta(req) {
    const sessionId = req.headers.get("Cookie")
      ?.split(";")
      .find(c => c.trim().startsWith("sessionId="))
      ?.split("=")[1];

    if (!sessionId) {
      throw new Error("No session");
    }

    // Validate session (check Redis, KV, etc.)
    const session = await validateSession(sessionId);

    if (!session) {
      throw new Error("Invalid session");
    }

    return {
      userId: session.userId,
      clientId: crypto.randomUUID(),
      channels: ["default"]
    };
  },

  onConnect(ctx) {
    console.log(`User ${ctx.meta.userId} connected via session`);
  }
});
```

## API Key Authentication

For server-to-server or mobile apps:

```typescript
export const apiKeyRoom = defineRoom({
  name: "api-key-room",
  websocketPath: "/ws",
  
  async extractMeta(req) {
    const apiKey = req.headers.get("X-API-Key");

    if (!apiKey) {
      throw new Error("API key required");
    }

    // Verify API key (check against database/KV)
    const client = await verifyApiKey(apiKey);

    if (!client) {
      throw new Error("Invalid API key");
    }

    return {
      userId: client.id,
      clientId: crypto.randomUUID(),
      channels: client.allowedChannels
    };
  },

  onConnect(ctx) {
    console.log(`API client ${ctx.meta.userId} connected`);
  }
});
```

## Related Documentation

- [Authorization](./authorization.md) - What users can do
- [Input Validation](./input-validation.md) - Validating user input
- [Security Checklist](./checklist.md) - Production security checklist

