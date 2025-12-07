/**
 * Simple Counter Client - Predetermined Example
 *
 * Demonstrates state persistence by performing a sequence of actions.
 * The counter value persists across Actor hibernation.
 */

import { VeraniClient } from "../../src/client";

const SERVER_URL = "ws://localhost:8787/ws/counter";

async function main() {
  console.log("[Counter Client] Starting...");

  const client = new VeraniClient(SERVER_URL);

  // Track if we've received initial sync
  let synced = false;

  // Handle counter sync (initial state)
  client.on("counter:sync", (data) => {
    console.log(`[Counter Client] 📊 Current count: ${data.count}`);
    if (data.lastUpdatedBy) {
      console.log(`[Counter Client]    Last updated by: ${data.lastUpdatedBy}`);
    }
    synced = true;
  });

  // Handle counter updates
  client.on("counter:update", (data) => {
    console.log(`[Counter Client] ✨ Count updated to ${data.count} by ${data.updatedBy}`);
  });

  // Handle counter reset
  client.on("counter:reset", (data) => {
    console.log(`[Counter Client] 🔄 Counter reset by ${data.resetBy}`);
  });

  try {
    // Wait for connection (client auto-connects in constructor)
    await client.waitForConnection();
    console.log("[Counter Client] ✅ Connected");

    // Wait for initial sync
    await new Promise((resolve) => {
      const checkSync = setInterval(() => {
        if (synced) {
          clearInterval(checkSync);
          resolve(undefined);
        }
      }, 100);
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Perform predetermined actions
    console.log("[Counter Client] Incrementing by 1...");
    client.emit("counter:increment", { amount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] Incrementing by 5...");
    client.emit("counter:increment", { amount: 5 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] Decrementing by 2...");
    client.emit("counter:decrement", { amount: 2 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] Getting current count...");
    client.emit("counter:get", {});
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] Resetting counter...");
    client.emit("counter:reset", {});
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] Incrementing by 3 after reset...");
    client.emit("counter:increment", { amount: 3 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[Counter Client] ✅ Demo complete. Counter state persists across hibernation!");
    console.log("[Counter Client]    Disconnect and reconnect to see the persisted value.");

    // Disconnect after a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));
    client.disconnect();
    console.log("[Counter Client] 👋 Disconnected");
  } catch (err) {
    console.log(`[Counter Client] ❌ Error: ${err}`);
  }
}

main();
