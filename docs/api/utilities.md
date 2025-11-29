# Utility Functions

Utility functions provided by Verani.

## `parseJWT(token: string): any`

Basic JWT token parser (payload only, no verification).

**Parameters:**
- `token: string` - JWT token string

**Returns:** Decoded payload or `null` if invalid

**Example:**

```typescript
import { parseJWT } from "verani";

const payload = parseJWT(token);
if (payload) {
  console.log("User ID:", payload.sub);
}
```

**Note:** This does NOT verify signatures. Use a proper JWT library for production authentication.

---

## `storeAttachment(ws: WebSocket, meta: ConnectionMeta)`

Stores metadata in WebSocket attachment for hibernation survival.

**Note:** Usually called automatically by the Actor runtime.

---

## `restoreSessions(actor: VeraniActor)`

Restores sessions from WebSocket attachments after hibernation.

**Note:** Called automatically in `onInit()`.

---

## Related Documentation

- [Server API](./server.md) - Server-side API reference
- [Client API](./client.md) - Client-side API reference
- [Types](./types.md) - Type definitions

