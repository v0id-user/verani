# Typed Examples

Type-safe Verani examples using the contract system.

## Echo Example

A simple echo server that demonstrates the typed API.

### Files

- `echo-contract.ts` - Shared contract definition
- `echo-server.ts` - Type-safe server room
- `echo-client.ts` - Type-safe client

### Usage

```bash
# Start the server
wrangler dev

# Run the client
bun run examples/typed/echo-client.ts
```

### Type Safety Highlights

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

