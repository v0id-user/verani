/**
 * Echo Client - Type-safe client example
 *
 * A simple client that sends messages and receives echoes.
 * Uses "verani/typed/client" (client entry point, NO server dependencies).
 */
import { createTypedClient } from "../../src/typed/client-entry";
import { echoContract } from "./echo-contract";

// Create the typed client
const client = createTypedClient(
  echoContract,
  "ws://localhost:8787/ws/echo?userId=demo-user",
  {
    reconnection: { enabled: true, maxAttempts: 5 },
  }
);

// Listen for server events - fully typed!
client.on("welcome", (data) => {
  // data: { message: string }
  console.log("Server says:", data.message);
});

client.on("echo.response", (data) => {
  // data: { message: string; timestamp: number }
  console.log(`Echo received: "${data.message}" at ${new Date(data.timestamp).toISOString()}`);
});

// Connection lifecycle
client.onOpen(() => {
  console.log("Connected to echo server!");

  // Send typed client event
  client.emit("echo.send", { message: "Hello, Echo!" });

  // Send another after a delay
  setTimeout(() => {
    client.emit("echo.send", { message: "This is a typed message!" });
  }, 1000);
});

client.onStateChange((state) => {
  console.log("Connection state:", state);
});
