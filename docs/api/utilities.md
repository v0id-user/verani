# Utility Functions

Utility functions exported from `verani`.

---

## Attachment

### `storeAttachment(ws, meta)`

Stores connection metadata as a WebSocket attachment for hibernation survival.

```typescript
import { storeAttachment } from "verani";

storeAttachment(ws, { userId: "u1", clientId: "c1", channels: ["default"] });
```

**Parameters:**
- `ws: WebSocket` — The WebSocket to attach metadata to
- `meta: ConnectionMeta` — Connection metadata (`userId`, `clientId`, `channels`)

**Note:** Usually called automatically by the connection handler. Only use this directly if building a custom actor.

---

## State Persistence

These utilities power the declarative persistence system. Most users interact with persistence through `defineConnection({ state, persistedKeys })` — see [Persistence Concepts](../concepts/persistence.md). Use these directly only for advanced use cases.

### `initializePersistedState(actor, initialState, persistedKeys?, options?)`

Loads persisted state from Durable Object storage and returns a proxied state object that auto-persists changes.

```typescript
import { initializePersistedState } from "verani";

const state = await initializePersistedState(actor, { count: 0, name: "default" }, ["count"]);
state.count = 10; // automatically persisted
```

**Parameters:**
- `actor: PersistableActor` — The actor instance with `ctx.storage`
- `initialState: T` — Default state values (used when no stored data exists)
- `persistedKeys?: (keyof T)[]` — Keys to persist. Empty array or omitted = all keys
- `options?: SafePersistOptions` — `{ shallow?: boolean, throwOnError?: boolean }`

**Returns:** `Promise<T>` — Proxied state object

### `isStateReady(actor)`

Checks whether persisted state has been initialized.

```typescript
import { isStateReady } from "verani";

if (isStateReady(actor)) {
  // safe to access state
}
```

### `getPersistedState<T>(actor)`

Returns the persisted state object. Throws `PersistNotReadyError` if not yet initialized.

```typescript
import { getPersistedState } from "verani";

const state = getPersistedState<{ count: number }>(actor);
```

### `persistKey(actor, key, value)`

Manually persist a single key-value pair.

```typescript
import { persistKey } from "verani";

await persistKey(actor, "count", 42);
```

### `deletePersistedKey(actor, key)`

Delete a single persisted key from storage.

```typescript
import { deletePersistedKey } from "verani";

await deletePersistedKey(actor, "count");
```

### `getPersistedKeys(actor)`

List all persisted key names.

```typescript
import { getPersistedKeys } from "verani";

const keys = await getPersistedKeys(actor); // ["count", "name"]
```

### `clearPersistedState(actor)`

Delete all persisted keys from storage.

```typescript
import { clearPersistedState } from "verani";

await clearPersistedState(actor);
```

### `setPersistErrorHandler(actor, handler)`

Set a callback for persistence failures.

```typescript
import { setPersistErrorHandler } from "verani";

setPersistErrorHandler(actor, (key, error) => {
  console.error(`Failed to persist ${key}:`, error);
});
```

> **Note:** The old misspelled `setPeristErrorHandler` is still exported as a deprecated alias.

### `safeSerialize(value)`

Serialize a value to JSON with special type handling. Handles `Date`, `Map`, `Set`, `RegExp`, `Error`, circular references, functions, and symbols.

```typescript
import { safeSerialize } from "verani";

safeSerialize(new Map([["a", 1]]));
// '{"__type":"Map","entries":[["a",1]]}'
```

### `safeDeserialize(json)`

Deserialize JSON produced by `safeSerialize`, restoring special types.

```typescript
import { safeDeserialize } from "verani";

const map = safeDeserialize('{"__type":"Map","entries":[["a",1]]}');
// Map { "a" => 1 }
```

### Error Classes

- **`PersistNotReadyError`** — Thrown when accessing state before `initializePersistedState` completes
- **`PersistError`** — Thrown on persistence failures (wraps the original error via `.originalCause`)

### Types

```typescript
import type { SafePersistOptions, PersistableActor } from "verani";
```

- **`SafePersistOptions`** — `{ shallow?: boolean, throwOnError?: boolean }`
- **`PersistableActor`** — Interface for actors that support persistence (requires `ctx.storage`)

---

## Debug

### `enableDebug(enabled)`

Enable or disable verbose debug logging. Disabled by default — a library should not log aggressively.

```typescript
import { enableDebug } from "verani";

enableDebug(true); // Enables [Verani:*] debug output
enableDebug(false); // Disables it
```

---

## Protocol

Low-level encoding/decoding for the Verani WebSocket protocol. These are used internally but exported for custom protocol handling.

### `encodeFrame(frame)`

Encode a `MessageFrame` to a JSON string.

```typescript
import { encodeFrame } from "verani";

const json = encodeFrame({ type: "chat.message", data: { text: "hi" } });
```

### `decodeFrame(raw)`

Decode raw WebSocket data into a `MessageFrame`. Returns `null` if parsing or validation fails.

```typescript
import { decodeFrame } from "verani";

const frame = decodeFrame(rawData);
if (frame) {
  console.log(frame.type, frame.data);
}
```

### `encodeClientMessage(message)` / `encodeServerMessage(message)`

Semantic aliases for `encodeFrame` — use whichever reads better in context.

### `decodeClientMessage(raw)` / `decodeServerMessage(raw)`

Semantic aliases for `decodeFrame`.

### `PROTOCOL_VERSION`

Current protocol version string (`"1.0.0"`).

---

## Related Documentation

- [Server API](./server.md) — Server-side API reference
- [Client API](./client.md) — Client-side API reference
- [Typed API](./typed.md) — Type-safe contracts
- [Types](./types.md) — Type definitions
- [Persistence Concepts](../concepts/persistence.md) — Declarative persistence guide
