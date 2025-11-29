# Hibernation

Understanding how Cloudflare Actors hibernate and how Verani handles it.

## Hibernation = Sleep Mode for Actors

Cloudflare Actors **hibernate** when idle to save resources. This means:

1. **In-memory state is lost** (like the `sessions` Map)
2. **WebSocket connections stay alive** and can wake the Actor
3. **You need to restore state** when the Actor wakes up

Verani solves this automatically:

```typescript
// On connect: Store metadata in WebSocket attachment
storeAttachment(ws, { userId, clientId, channels });

// On wake: Restore all sessions from attachments
restoreSessions(actor);
```

**Mental model**: Think of attachments as "sticky notes" on each WebSocket that survive hibernation.

## When Does Hibernation Occur?

Cloudflare Actors hibernate when:
- No requests have been received for a period of time
- No WebSocket messages have been sent/received
- The runtime decides to optimize resource usage

Sessions are automatically restored via WebSocket attachments, but application state must be reconciled manually using the `onHibernationRestore` hook.

## Related Documentation

- [State Management](./state-management.md) - State types and persistence
- [Server API - onHibernationRestore](../api/server.md#onhibernationrestoreactor-veraniactor-void--promisevoid) - Hibernation hook
- [Examples - Presence](../examples/presence.md) - Example with hibernation handling

