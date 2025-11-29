# Security Guide

Comprehensive security practices for Verani applications.

## Table of Contents

- [Authentication](#authentication)
- [Authorization](#authorization)
- [Input Validation](#input-validation)
- [Rate Limiting](#rate-limiting)
- [Common Vulnerabilities](#common-vulnerabilities)
- [Production Checklist](#production-checklist)

---

## Authentication

### Overview

Authentication verifies **who the user is**. Verani handles authentication in the `extractMeta` function.

### Public Rooms (No Authentication)

```typescript
export const publicRoom = defineRoom({
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

### JWT Authentication (Recommended)

#### Step 1: Client Gets Token

```typescript
// Your auth service issues JWT
const response = await fetch("https://your-api.com/login", {
  method: "POST",
  body: JSON.stringify({ username, password })
});

const { token } = await response.json();
```

#### Step 2: Client Connects with Token

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

#### Step 3: Server Verifies Token

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
  }
});
```

### Session-Based Authentication

If you have session cookies:

```typescript
export const sessionRoom = defineRoom({
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
  }
});
```

### API Key Authentication

For server-to-server or mobile apps:

```typescript
export const apiKeyRoom = defineRoom({
  extractMeta(req) {
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
  }
});
```

---

## Authorization

Authentication tells you **who** the user is. Authorization tells you **what they can do**.

### Role-Based Access Control (RBAC)

```typescript
interface AuthorizedMeta extends ConnectionMeta {
  role: "user" | "moderator" | "admin";
}

export const rbacRoom = defineRoom<AuthorizedMeta>({
  extractMeta(req) {
    // ... authenticate user ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      role: payload.role || "user"
    };
  },

  onMessage(ctx, frame) {
    // Check permissions for sensitive actions
    if (frame.type === "user.kick") {
      // Only moderators and admins can kick
      if (ctx.meta.role !== "moderator" && ctx.meta.role !== "admin") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Insufficient permissions" }
        }));
        return;
      }

      // Perform kick...
    }

    if (frame.type === "room.delete") {
      // Only admins can delete rooms
      if (ctx.meta.role !== "admin") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Admin access required" }
        }));
        return;
      }

      // Perform delete...
    }
  }
});
```

### Permission-Based Access Control

```typescript
interface PermissionMeta extends ConnectionMeta {
  permissions: Set<string>;
}

const PERMISSIONS = {
  SEND_MESSAGE: "message:send",
  DELETE_MESSAGE: "message:delete",
  BAN_USER: "user:ban",
  MANAGE_ROOM: "room:manage"
} as const;

export const permissionRoom = defineRoom<PermissionMeta>({
  extractMeta(req) {
    // ... authenticate ...
    const permissions = new Set(payload.permissions || []);

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      permissions
    };
  },

  onMessage(ctx, frame) {
    if (frame.type === "message.delete") {
      if (!ctx.meta.permissions.has(PERMISSIONS.DELETE_MESSAGE)) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Permission denied" }
        }));
        return;
      }

      // Perform delete...
    }
  }
});
```

### Resource-Level Authorization

Check if user owns/can access specific resources:

```typescript
export const resourceRoom = defineRoom({
  onMessage(ctx, frame) {
    if (frame.type === "document.edit") {
      const { documentId, changes } = frame.data;

      // Check if user has access to this document
      const hasAccess = await checkDocumentAccess(
        ctx.meta.userId,
        documentId
      );

      if (!hasAccess) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Access denied" }
        }));
        return;
      }

      // Apply edits...
    }
  }
});
```

---

## Input Validation

**Never trust client input.** Always validate and sanitize.

### Message Type Validation

```typescript
const ALLOWED_TYPES = new Set([
  "chat.message",
  "chat.typing",
  "channel.join",
  "channel.leave"
]);

export const validatedRoom = defineRoom({
  onMessage(ctx, frame) {
    // Validate message type
    if (!ALLOWED_TYPES.has(frame.type)) {
      console.warn(`Invalid message type: ${frame.type}`);
      return;
    }

    // Process...
  }
});
```

### Data Validation

```typescript
export const chatRoom = defineRoom({
  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      const { text } = frame.data;

      // Validate text exists and is a string
      if (!text || typeof text !== "string") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Invalid message format" }
        }));
        return;
      }

      // Validate length
      if (text.length > 5000) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Message too long (max 5000 chars)" }
        }));
        return;
      }

      // Sanitize (remove dangerous content)
      const sanitized = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .trim();

      // Broadcast sanitized message
      ctx.actor.broadcast("default", {
        type: "chat.message",
        from: ctx.meta.userId,
        text: sanitized
      });
    }
  }
});
```

### Using Validation Libraries

```typescript
// npm install zod
import { z } from "zod";

const ChatMessageSchema = z.object({
  text: z.string().min(1).max(5000),
  replyTo: z.string().uuid().optional()
});

export const zodRoom = defineRoom({
  onMessage(ctx, frame) {
    if (frame.type === "chat.message") {
      // Validate with Zod
      const result = ChatMessageSchema.safeParse(frame.data);

      if (!result.success) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: {
            message: "Invalid message",
            errors: result.error.issues
          }
        }));
        return;
      }

      const { text, replyTo } = result.data;
      // Process validated data...
    }
  }
});
```

---

## Rate Limiting

Prevent abuse by limiting message rates.

### Per-Connection Rate Limiting

```typescript
interface RateLimitMeta extends ConnectionMeta {
  messageCount: number;
  windowStart: number;
}

const RATE_LIMIT = {
  WINDOW_MS: 60000, // 1 minute
  MAX_MESSAGES: 30   // 30 messages per minute
};

export const rateLimitedRoom = defineRoom<RateLimitMeta>({
  extractMeta(req) {
    // ... auth ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      messageCount: 0,
      windowStart: Date.now()
    };
  },

  onMessage(ctx, frame) {
    const now = Date.now();
    const meta = ctx.meta;

    // Reset window if expired
    if (now - meta.windowStart > RATE_LIMIT.WINDOW_MS) {
      meta.messageCount = 0;
      meta.windowStart = now;
    }

    // Increment and check limit
    meta.messageCount++;

    if (meta.messageCount > RATE_LIMIT.MAX_MESSAGES) {
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: {
          message: "Rate limit exceeded",
          retryAfter: Math.ceil(
            (RATE_LIMIT.WINDOW_MS - (now - meta.windowStart)) / 1000
          )
        }
      }));
      return;
    }

    // Process message...
  }
});
```

### Per-User Global Rate Limiting

Use Cloudflare KV or Durable Object storage:

```typescript
export const globalRateLimitRoom = defineRoom({
  async onMessage(ctx, frame) {
    const userId = ctx.meta.userId;
    const key = `ratelimit:${userId}`;

    // Get current count from KV
    const current = await env.KV.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= 100) {
      ctx.ws.send(JSON.stringify({
        type: "error",
        data: { message: "Daily limit exceeded" }
      }));
      return;
    }

    // Increment with TTL
    await env.KV.put(key, (count + 1).toString(), {
      expirationTtl: 86400 // 24 hours
    });

    // Process message...
  }
});
```

---

## Common Vulnerabilities

### 1. Cross-Site WebSocket Hijacking (CSWSH)

**Problem**: Attacker tricks user's browser into opening WebSocket to your server.

**Solution**: Verify `Origin` header:

```typescript
export const secureRoom = defineRoom({
  extractMeta(req) {
    const origin = req.headers.get("Origin");
    const allowedOrigins = [
      "https://yourapp.com",
      "https://www.yourapp.com"
    ];

    if (!origin || !allowedOrigins.includes(origin)) {
      throw new Error("Invalid origin");
    }

    // Continue with auth...
  }
});
```

### 2. Message Injection

**Problem**: Attacker sends malicious message that gets broadcast as-is.

**Solution**: Always sanitize before broadcasting:

```typescript
function sanitize(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/javascript:/gi, "")
    .trim();
}

ctx.actor.broadcast("default", {
  type: "chat.message",
  text: sanitize(frame.data.text)
});
```

### 3. Denial of Service (DoS)

**Problem**: Attacker floods server with connections or messages.

**Solutions**:

- Rate limit connections per IP
- Rate limit messages per user
- Limit max connections per Actor
- Implement backpressure

```typescript
onConnect(ctx) {
  if (ctx.actor.getSessionCount() > 1000) {
    ctx.ws.close(1008, "Server capacity reached");
    return;
  }
}
```

### 4. Information Disclosure

**Problem**: Error messages expose internals.

**Solution**: Generic error messages to clients:

```typescript
onError(error, ctx) {
  // Log detailed error server-side
  console.error("Internal error:", error);

  // Send generic message to client
  ctx.ws.send(JSON.stringify({
    type: "error",
    data: { message: "An error occurred" }
  }));
}
```

---

## Production Checklist

Before deploying to production:

### Authentication & Authorization
- [ ] Implement proper authentication (JWT/session)
- [ ] Verify token signatures, not just decode
- [ ] Check token expiration
- [ ] Validate all claims
- [ ] Implement role-based or permission-based authorization
- [ ] Use HTTPS/WSS only (never WS/HTTP in production)

### Input Validation
- [ ] Validate all message types
- [ ] Validate all data fields
- [ ] Sanitize user-generated content
- [ ] Enforce length limits
- [ ] Use schema validation (Zod, etc.)

### Rate Limiting
- [ ] Implement per-connection rate limiting
- [ ] Implement per-user rate limiting
- [ ] Limit connections per Actor
- [ ] Handle rate limit errors gracefully

### Security Headers & CORS
- [ ] Validate `Origin` header
- [ ] Set appropriate CORS headers
- [ ] Use secure cookies (httpOnly, secure, sameSite)

### Error Handling
- [ ] Never expose stack traces to clients
- [ ] Log errors server-side
- [ ] Use generic error messages for clients
- [ ] Implement error monitoring (Sentry, etc.)

### Monitoring & Logging
- [ ] Log authentication attempts
- [ ] Log authorization failures
- [ ] Monitor rate limit violations
- [ ] Set up alerts for suspicious activity
- [ ] Track connection counts and patterns

### Data Protection
- [ ] Don't store sensitive data in Actor memory
- [ ] Encrypt sensitive data at rest
- [ ] Use environment variables for secrets
- [ ] Rotate secrets regularly

### Testing
- [ ] Test with invalid tokens
- [ ] Test with expired tokens
- [ ] Test rate limiting
- [ ] Test malicious input
- [ ] Test CSWSH protection

---

## Additional Resources

- [OWASP WebSocket Security](https://owasp.org/www-community/vulnerabilities/WebSocket_security)
- [Cloudflare Workers Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

## Questions?

- See [Examples](./EXAMPLES.md) for implementation patterns
- See [API Reference](./API.md) for full API documentation
- Check [GitHub Discussions](https://github.com/v0id-user/verani/discussions) for community help

