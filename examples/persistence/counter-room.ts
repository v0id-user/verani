/**
 * Simple Persistent Counter Example
 *
 * Demonstrates how state persists across hibernation.
 * The counter value survives even when the Actor goes to sleep!
 */

import { defineRoom, createActorHandler } from "../../src/verani";

export const counterRoom = defineRoom({
  name: "counter-actor",
  websocketPath: "/ws/counter",

  // Define your room's state
  state: {
    count: 0,
    lastUpdatedBy: null as string | null,
  },

  // These keys are automatically persisted to Durable Object storage
  persistedKeys: ["count", "lastUpdatedBy"],

  // Optional: Handle persistence errors
  onPersistError(key, error) {
    console.error(`[Counter] Failed to persist "${key}":`, error.message);
  },

  onConnect(ctx) {
    console.log(`[Counter] User ${ctx.meta.userId} connected`);

    // Send current count to the new connection
    ctx.emit.emit("counter:sync", {
      count: ctx.actor.roomState.count,
      lastUpdatedBy: ctx.actor.roomState.lastUpdatedBy,
    });
  },

  onDisconnect(ctx) {
    console.log(`[Counter] User ${ctx.meta.userId} disconnected`);
  },
});

// Event: Increment the counter
counterRoom.on("counter:increment", (ctx, data) => {
  const amount = data?.amount ?? 1;

  ctx.actor.roomState.count += amount;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  console.log(`[Counter] Incremented by ${amount}, new value: ${ctx.actor.roomState.count}`);

  // Broadcast the update to all clients
  ctx.actor.emit.to("default").emit("counter:update", {
    count: ctx.actor.roomState.count,
    updatedBy: ctx.meta.userId,
  });
});

// Event: Decrement the counter
counterRoom.on("counter:decrement", (ctx, data) => {
  const amount = data?.amount ?? 1;

  ctx.actor.roomState.count -= amount;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  console.log(`[Counter] Decremented by ${amount}, new value: ${ctx.actor.roomState.count}`);

  ctx.actor.emit.to("default").emit("counter:update", {
    count: ctx.actor.roomState.count,
    updatedBy: ctx.meta.userId,
  });
});

// Event: Reset the counter
counterRoom.on("counter:reset", (ctx) => {
  ctx.actor.roomState.count = 0;
  ctx.actor.roomState.lastUpdatedBy = ctx.meta.userId;

  console.log(`[Counter] Reset to 0 by ${ctx.meta.userId}`);

  ctx.actor.emit.to("default").emit("counter:reset", {
    resetBy: ctx.meta.userId,
  });
});

// Event: Get current count (responds only to requester)
counterRoom.on("counter:get", (ctx) => {
  ctx.emit.emit("counter:sync", {
    count: ctx.actor.roomState.count,
    lastUpdatedBy: ctx.actor.roomState.lastUpdatedBy,
  });
});

// Export the Actor handler
export const CounterActor = createActorHandler(counterRoom);
