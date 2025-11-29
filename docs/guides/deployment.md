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

## Local Development

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

## Deploy to Production

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

## Custom Domain (Optional)

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

## Common Deployment Issues

### Issue: WebSocket connection fails

**Solutions:**

1. Check you're using `wss://` for production (not `ws://`)
2. Verify the `/ws` path is correct
3. Check browser console for errors
4. Run `wrangler tail` to see server-side errors

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

## Security Checklist

Before going to production:

- [ ] Implement authentication (JWT tokens) - **See [Security Guide - Authentication](../security/authentication.md)**
- [ ] Validate all client input
- [ ] Rate limit messages per user
- [ ] Sanitize user-generated content
- [ ] Use HTTPS/WSS only (never HTTP/WS)
- [ ] Don't expose error details to clients
- [ ] Log security events
- [ ] Set up monitoring and alerts
- [ ] Verify Origin header to prevent CSWSH attacks
- [ ] Use environment variables for secrets (never commit secrets)

**📖 Read the complete [Security Guide](../security/authentication.md) for implementation details.**

## Next Steps

- **[Configuration Guide](./configuration.md)** - Wrangler configuration details
- **[Monitoring Guide](./monitoring.md)** - Logs and metrics
- **[Scaling Guide](./scaling.md)** - Performance and scaling strategies
- **[Security Guide](../security/authentication.md)** - Authentication and security best practices
- **[API Reference](../api/server.md)** - Complete API documentation

## Support

- GitHub Issues: [Report bugs](https://github.com/v0id-user/verani/issues)
- Discussions: [Ask questions](https://github.com/v0id-user/verani/discussions)
- Discord: [Join community](#) (coming soon)

