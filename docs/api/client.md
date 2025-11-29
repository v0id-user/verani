# Client Side API

Complete client-side API documentation for Verani.

## `new VeraniClient(url, options?)`

Creates a new Verani WebSocket client.

**Parameters:**
- `url: string` - WebSocket URL (wss://...)
- `options?: VeraniClientOptions` - Client configuration

**Example:**

```typescript
const client = new VeraniClient(
  "wss://my-worker.dev/ws?userId=alice",
  {
    reconnection: {
      enabled: true,
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 1.5
    },
    maxQueueSize: 100,
    connectionTimeout: 10000,
    pingInterval: 5000,  // Send ping every 5 seconds
    pongTimeout: 5000    // Expect pong within 5 seconds
  }
);
```

**Ping/Pong Keepalive:**

Verani automatically manages connection keepalive using ping/pong messages:

- **Automatic ping**: Sends ping messages at the configured interval to keep the connection alive
- **Pong detection**: Monitors pong responses and triggers reconnection if timeout is exceeded
- **Page Visibility API**: Automatically resyncs ping intervals when browser tabs become active again, preventing silent failures after tab inactivity
- **Environment-aware**: Only activates in browser environments; gracefully handles Node.js/SSR environments

To disable ping/pong keepalive:

```typescript
const client = new VeraniClient(url, {
  pingInterval: 0  // Disable keepalive
});
```

---

## `client.on(event, callback)`

Registers an event listener.

**Parameters:**
- `event: string` - Event type to listen for
- `callback: (data: any) => void` - Handler function

**Example:**

```typescript
client.on("chat.message", (data) => {
  console.log(`${data.from}: ${data.text}`);
});
```

---

## `client.off(event, callback)`

Removes an event listener.

**Example:**

```typescript
const handler = (data) => console.log(data);
client.on("event", handler);
client.off("event", handler);
```

---

## `client.once(event, callback)`

Registers a one-time event listener.

**Example:**

```typescript
client.once("welcome", (data) => {
  console.log("First message received:", data);
});
```

---

## `client.emit(type, data?)`

Sends a message to the server.

**Parameters:**
- `type: string` - Message type
- `data?: any` - Optional message data

**Example:**

```typescript
client.emit("chat.message", { text: "Hello!" });
client.emit("ping"); // No data
```

---

## `client.getState(): ConnectionState`

Returns the current connection state.

**Returns:** `"connecting" | "connected" | "disconnected" | "reconnecting" | "error"`

**Example:**

```typescript
if (client.getState() === "connected") {
  console.log("Ready to send");
}
```

---

## `client.isConnected(): boolean`

Checks if the client is currently connected.

**Example:**

```typescript
if (client.isConnected()) {
  client.emit("message", data);
}
```

---

## `client.getConnectionState(): ConnectionStateInfo`

Returns detailed connection state information.

**Returns:** An object containing:
- `state: ConnectionState` - Current connection state (`"connecting" | "connected" | "disconnected" | "reconnecting" | "error"`)
- `isConnected: boolean` - Whether the client is currently connected
- `isConnecting: boolean` - Whether the client is currently attempting to connect
- `reconnectAttempts: number` - Number of reconnection attempts made
- `connectionId: number` - Unique identifier for the current connection attempt

**Example:**

```typescript
const info = client.getConnectionState();
console.log(`State: ${info.state}`);
console.log(`Reconnect attempts: ${info.reconnectAttempts}`);
if (info.isConnecting) {
  console.log("Connection in progress...");
}
```

---

## `client.isConnecting: boolean` (read-only property)

Read-only property indicating whether the client is currently attempting to establish a connection.

**Example:**

```typescript
if (client.isConnecting) {
  showLoadingIndicator();
}
```

---

## `client.waitForConnection(): Promise<void>`

Returns a promise that resolves when connected. The promise will reject with an error if the connection wait times out (default timeout is 2x the `connectionTimeout` option).

**Example:**

```typescript
try {
  await client.waitForConnection();
  console.log("Now connected!");
  client.emit("ready", {});
} catch (error) {
  console.error("Failed to connect:", error);
}
```

---

## `client.onOpen(callback)`

Registers a callback for when the connection opens.

**Example:**

```typescript
client.onOpen(() => {
  console.log("Connected!");
  updateUI("online");
});
```

---

## `client.onClose(callback)`

Registers a callback for when the connection closes.

**Example:**

```typescript
client.onClose((event) => {
  console.log(`Closed: ${event.code} ${event.reason}`);
});
```

---

## `client.onError(callback)`

Registers a callback for connection errors.

**Example:**

```typescript
client.onError((error) => {
  console.error("Connection error:", error);
});
```

---

## `client.onStateChange(callback)`

Registers a callback for state changes.

**Example:**

```typescript
client.onStateChange((state) => {
  console.log("State:", state);
  updateStatusIndicator(state);
});
```

---

## `client.reconnect()`

Manually triggers a reconnection.

**Example:**

```typescript
button.onclick = () => {
  client.reconnect();
};
```

---

## `client.disconnect()`

Closes the connection without reconnecting.

**Example:**

```typescript
window.onbeforeunload = () => {
  client.disconnect();
};
```

---

## `client.close()`

Closes the connection and cleans up all resources.

**Example:**

```typescript
// Component unmounting
onDestroy(() => {
  client.close();
});
```

---

## `VeraniClientOptions`

Client configuration options.

```typescript
interface VeraniClientOptions {
  reconnection?: Partial<ReconnectionConfig>;
  maxQueueSize?: number;
  connectionTimeout?: number;
  pingInterval?: number;  // Ping interval in milliseconds (0 = disabled, default: 5000)
  pongTimeout?: number;   // Pong timeout in milliseconds (default: 5000)
}
```

**Properties:**

### `reconnection?: Partial<ReconnectionConfig>`

Reconnection behavior configuration. See `ReconnectionConfig` below.

### `maxQueueSize?: number`

Maximum number of messages to queue when disconnected. Messages are queued when the connection is not ready and flushed when reconnected.

**Default:** `100`

### `connectionTimeout?: number`

Connection timeout in milliseconds. If the WebSocket connection doesn't establish within this time, it will timeout and trigger reconnection.

**Default:** `10000` (10 seconds)

### `pingInterval?: number`

Ping interval in milliseconds. The client will send ping messages at this interval to keep the connection alive. Set to `0` to disable ping/pong keepalive.

**Default:** `5000` (5 seconds)

**Note:** Verani automatically handles Page Visibility API to resync ping intervals when browser tabs become active again. This prevents ping intervals from going silent after tab inactivity.

### `pongTimeout?: number`

Pong timeout in milliseconds. If no pong response is received within this time plus the ping interval, the connection will be considered dead and trigger reconnection.

**Default:** `5000` (5 seconds)

---

## `ReconnectionConfig`

Reconnection behavior configuration.

```typescript
interface ReconnectionConfig {
  enabled: boolean;          // Enable auto-reconnection
  maxAttempts: number;       // Max attempts (0 = infinite)
  initialDelay: number;      // Initial delay in ms
  maxDelay: number;          // Maximum delay in ms
  backoffMultiplier: number; // Exponential backoff multiplier
}
```

**Defaults:**

```typescript
{
  enabled: true,
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 1.5
}
```

---

## Related Documentation

- [Server API](./server.md) - Server-side API reference
- [Types](./types.md) - Type definitions
- [Utilities](./utilities.md) - Utility functions

