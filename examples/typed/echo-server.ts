/**
 * Echo Server - Type-safe connection example
 *
 * A simple echo server that responds to messages.
 * Uses "verani/typed" (server entry point with Cloudflare dependencies).
 */
import { createTypedConnection, createConnectionHandler } from "../../src/typed";
import type { ConnectionMeta } from "../../src/typed";
import { echoContract } from "./echo-contract";

// Optional: extend metadata
interface EchoMeta extends ConnectionMeta {
  connectedAt: number;
}

// Create the typed connection
const echoConnection = createTypedConnection<typeof echoContract, EchoMeta>(echoContract, {
  name: "echo",
  websocketPath: "/ws/echo",

  extractMeta(req) {
    const url = new URL(req.url);
    return {
      userId: url.searchParams.get("userId") ?? crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      channels: ["default"],
      connectedAt: Date.now(),
    };
  },

  onConnect(ctx) {
    console.log(`[Echo] User ${ctx.meta.userId} connected`);

    // Typed emit - only serverEvents allowed
    ctx.emit("welcome", {
      message: `Hello ${ctx.meta.userId}! Send a message to echo.`,
    });
  },

  onDisconnect(ctx) {
    console.log(`[Echo] User ${ctx.meta.userId} disconnected`);
  },
});

// Handle client events with full type safety (Socket.io-like API)
echoConnection.on("echo.send", (ctx, data) => {
  // data is typed as { message: string }
  console.log(`[Echo] Received from ${ctx.meta.userId}: ${data.message}`);

  // Respond with typed server event
  ctx.emit("echo.response", {
    message: data.message,
    timestamp: Date.now(),
  });
});

// Export for Cloudflare Workers
export const EchoConnection = createConnectionHandler(echoConnection.definition);
export { echoConnection };

