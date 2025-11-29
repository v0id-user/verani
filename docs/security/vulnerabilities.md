# Common Vulnerabilities

Common security vulnerabilities and how to prevent them.

## 1. Cross-Site WebSocket Hijacking (CSWSH)

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

## 2. Message Injection

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

## 3. Denial of Service (DoS)

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

## 4. Information Disclosure

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

## Additional Resources

- [OWASP WebSocket Security](https://owasp.org/www-community/vulnerabilities/WebSocket_security)
- [Cloudflare Workers Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Authorization](./authorization.md) - What users can do
- [Input Validation](./input-validation.md) - Validating user input
- [Rate Limiting](./rate-limiting.md) - Preventing abuse
- [Security Checklist](./checklist.md) - Production security checklist

