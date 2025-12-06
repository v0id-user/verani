# Typed Examples

Type-safe Verani examples using the contract system.

## Entry Points

The typed module has **three separate entry points** to prevent dependency leakage:

| Entry Point | Use Case | Dependencies |
|-------------|----------|--------------|
| `verani/typed` | Server (Cloudflare Workers) | Cloudflare Actors |
| `verani/typed/client` | Client (Browser, Node.js) | None (client-safe) |
| `verani/typed/shared` | Contract definitions only | None (pure types) |

## Echo Example

A simple echo server demonstrating the typed API.

### Files

```
echo-contract.ts  → imports from "verani/typed/shared"
echo-server.ts    → imports from "verani/typed"
echo-client.ts    → imports from "verani/typed/client"
```

### Usage

```bash
# Start the server
wrangler dev

# Run the client
bun run examples/typed/echo-client.ts
```

### Import Patterns

**Shared contract (no runtime deps):**

```typescript
// contracts/chat.ts - can be imported by both server and client
import { defineContract, payload } from "verani/typed/shared";

export const chatContract = defineContract({
  serverEvents: {
    "echo.response": payload<{ message: string; timestamp: number }>(),
  },
  clientEvents: {
    "echo.send": payload<{ message: string }>(),
  },
});
```

**Server code (Cloudflare Workers):**

```typescript
// server/room.ts - only runs on Cloudflare
import { createTypedRoom, createActorHandler } from "verani/typed";
import { chatContract } from "../contracts/chat";

const room = createTypedRoom(chatContract, { ... });
export const ChatRoom = createActorHandler(room.definition);
```

**Client code (Browser/Node.js):**

```typescript
// client/app.ts - runs anywhere
import { createTypedClient } from "verani/typed/client";
import { chatContract } from "../contracts/chat";

const client = createTypedClient(chatContract, "wss://...");
```

### Type Safety

**Contract defines all events once:**

```typescript
const echoContract = defineContract({
  serverEvents: {
    "echo.response": payload<{ message: string; timestamp: number }>(),
  },
  clientEvents: {
    "echo.send": payload<{ message: string }>(),
  },
});
```

**Server handlers are typed:**

```typescript
echoRoom.handle("echo.send", (ctx, data) => {
  // data: { message: string } - inferred!
  ctx.emit("echo.response", { message: data.message, timestamp: Date.now() });
});
```

**Client listeners are typed:**

```typescript
client.on("echo.response", (data) => {
  // data: { message: string; timestamp: number } - inferred!
  console.log(data.message);
});

client.emit("echo.send", { message: "Hello!" }); // typed!
```
