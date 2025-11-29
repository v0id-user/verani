# Connection Lifecycle

Understanding the connection lifecycle on both server and client.

## Server Side

```
WebSocket connects
      ↓
extractMeta(request)  → { userId, clientId, channels }
      ↓
storeAttachment(ws, meta)
      ↓
sessions.set(ws, { ws, meta })
      ↓
onConnect(ctx)
      ↓
[connection active, messages flow]
      ↓
WebSocket closes
      ↓
sessions.delete(ws)
      ↓
onDisconnect(ctx)
```

## Client Side

```
new VeraniClient(url)
      ↓
State: "connecting"
      ↓
WebSocket opens
      ↓
State: "connected"
      ↓
[connection active, messages flow]
      ↓
WebSocket closes (unexpected)
      ↓
State: "reconnecting"
      ↓
Exponential backoff delay
      ↓
Retry connection
```

## Related Documentation

- [Architecture](./architecture.md) - System architecture
- [Hibernation](./hibernation.md) - Hibernation behavior
- [Server API - Lifecycle Hooks](../api/server.md#roomdefinitiontmeta) - Hook documentation
- [Client API](../api/client.md) - Client lifecycle methods

