# Monitoring Guide

How to monitor and debug your Verani application.

## View Logs

Stream real-time logs:

```bash
wrangler tail
```

Filter logs:

```bash
wrangler tail --format pretty
```

## Metrics

View metrics in Cloudflare Dashboard:
- Workers & Pages → Your Worker → Metrics

Key metrics:
- **Requests**: WebSocket upgrade requests
- **Errors**: Connection failures
- **CPU Time**: Processing time per request
- **Duration**: Time Actor stays active

## Debug Logging

Verani ships with an opt-in debug utility. Enable it to see internal logs prefixed with `[Verani:*]`:

```typescript
import { enableDebug } from "verani";

// Enable during development
enableDebug(true);

// Disable in production (default)
enableDebug(false);
```

Debug output includes connection lifecycle events, room join/leave operations, message routing, and RPC calls between DOs.

## Debugging Tips

### Check Server Logs

Use `wrangler tail` to see real-time server logs:

```bash
# Basic tail
wrangler tail

# Pretty format
wrangler tail --format pretty

# Filter by status
wrangler tail --status error
```

### Browser DevTools

Use browser DevTools to inspect WebSocket connections:

1. Open DevTools → Network tab
2. Filter by WS (WebSocket)
3. Click on your WebSocket connection
4. View messages in the Messages tab

### Common Log Patterns

When `enableDebug(true)` is set:

```
[Verani:connection] User alice connected (client: abc-123)
[Verani:room] User alice joined room "chat"
[Verani:room] Broadcasting to 3 members
```

## Related Documentation

- [Deployment Guide](./deployment.md) - Deployment steps
- [Troubleshooting](../getting-started/troubleshooting.md) - Common issues and solutions
- [Scaling Guide](./scaling.md) - Performance monitoring

