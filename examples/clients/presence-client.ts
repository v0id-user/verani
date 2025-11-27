#!/usr/bin/env bun
/**
 * Presence Client Example
 *
 * Demonstrates real-time presence tracking using VeraniClient SDK
 *
 * Usage:
 *   bun run examples/clients/presence-client.ts
 *
 * Each instance generates a random username and displays a live presence dashboard.
 * Open multiple terminals to see real-time presence tracking!
 *
 * Features:
 * - Real-time presence updates
 * - Multi-device tracking (same user, multiple terminals)
 * - Status indicators (online/away/busy)
 * - Device count per user
 * - Auto-updating dashboard
 */

import { VeraniClient } from "../../src/client/client";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  whiteBG: "\x1b[47m",
  black: "\x1b[30m",
};

interface UserPresence {
  userId: string;
  username: string;
  status: "online" | "away" | "busy";
  devices: number;
}

interface PresenceState {
  currentUserId: string;
  users: Map<string, UserPresence>;
  totalUsers: number;
  totalConnections: number;
}

const state: PresenceState = {
  currentUserId: "",
  users: new Map(),
  totalUsers: 0,
  totalConnections: 0,
};

// Debounce timer for rendering
let renderTimeout: ReturnType<typeof setTimeout> | null = null;
const RENDER_DEBOUNCE_MS = 100;

/**
 * Debounced render function to handle rapid updates
 */
function debouncedRender() {
  if (renderTimeout) {
    clearTimeout(renderTimeout);
  }
  renderTimeout = setTimeout(() => {
    render();
    renderTimeout = null;
  }, RENDER_DEBOUNCE_MS);
}

/**
 * Clear the terminal screen for pretty print
 */
function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[0f");
}

/**
 * Gets status emoji and color
 */
function getStatusDisplay(status: string): { emoji: string; color: string } {
  switch (status) {
    case "online":
      return { emoji: "🟢", color: colors.green };
    case "away":
      return { emoji: "🟡", color: colors.yellow };
    case "busy":
      return { emoji: "🔴", color: colors.red };
    default:
      return { emoji: "⚪", color: colors.gray };
  }
}

/**
 * Pretty prints a separator bar with color
 */
function prettySeparator() {
  return `${colors.gray}${"━".repeat(55)}${colors.reset}`;
}

/**
 * Renders the presence UI with pretty print and clears the screen
 */
function render() {
  clearScreen();

  console.log(`${colors.bright}${colors.cyan}👥 ${colors.whiteBG}${colors.black} Presence Tracking Dashboard ${colors.reset}`);
  console.log(prettySeparator() + "\n");

  // Stats
  const myUser = state.users.get(state.currentUserId);
  const myDevices = myUser?.devices || 0;

  console.log(`${colors.bright}Stats:${colors.reset}`);
  console.log(`  Total Users:       ${colors.blue}${state.totalUsers}${colors.reset}`);
  console.log(`  Total Connections: ${colors.green}${state.totalConnections}${colors.reset}`);
  console.log(`  Your Devices:      ${colors.magenta}${myDevices}${colors.reset}`);
  console.log();

  // Users list
  console.log(`${colors.bright}Online Users:${colors.reset}`);

  if (state.users.size === 0) {
    console.log(`  ${colors.gray}No users online${colors.reset}`);
  } else {
    const sortedUsers = Array.from(state.users.values()).sort((a, b) =>
      a.username.localeCompare(b.username)
    );

    for (const user of sortedUsers) {
      const isMe = user.userId === state.currentUserId;
      const { emoji, color } = getStatusDisplay(user.status);
      const deviceText = user.devices === 1 ? "1 device" : `${user.devices} devices`;

      const nameDisplay = isMe
        ? `${colors.bright}\x1b[4m${user.username}${colors.reset} ${colors.cyan}(you)${colors.reset}`
        : user.username;

      // Box around your user
      if (isMe) {
        console.log(
          `${colors.bright}${colors.green} ┌──────────────────────────────┐${colors.reset}`
        );
        console.log(`  ${emoji} ${nameDisplay}`);
        console.log(
          `     ${color}${user.status}${colors.reset} • ${colors.gray}${deviceText}${colors.reset}`
        );
        console.log(
          `${colors.bright}${colors.green} └──────────────────────────────┘${colors.reset}`
        );
      } else {
        console.log(`  ${emoji} ${nameDisplay}`);
        console.log(`     ${color}${user.status}${colors.reset} • ${colors.gray}${deviceText}${colors.reset}`);
      }
    }
  }

  console.log();
  console.log(prettySeparator());
  console.log(`${colors.gray}Press Ctrl+C to exit${colors.reset}`);
}

/**
 * Shows a notification banner
 */
function showNotification(message: string, type: "info" | "success" = "info") {
  clearScreen();
  render();
  const icon = type === "success" ? "✓" : "ℹ";
  const color = type === "success" ? colors.green : colors.blue;
  // Pretty notification box
  const banner = `${color}${colors.bright}┏${"━".repeat(message.length+8)}┓${colors.reset}
${color}${colors.bright}┃${colors.reset}  ${icon} ${message}  ${color}${colors.bright}┃${colors.reset}
${color}${colors.bright}┗${"━".repeat(message.length+8)}┛${colors.reset}`;
  console.log(banner);

  // Re-render after a short delay
  setTimeout(render, 1500);
}

/**
 * Main function
 */
async function main() {
  // Generate a random username for this session
  const username = `user-${crypto.randomUUID().slice(0, 8)}`;
  const token = `user:${username}`;
  state.currentUserId = username;

  clearScreen();
  console.log(`${colors.bright}👥 Presence Tracking Client${colors.reset}`);
  console.log(`${colors.gray}Connecting as ${username}...${colors.reset}\n`);

  // Build WebSocket URL
  const wsUrl = `ws://localhost:8787/ws/presence?token=${encodeURIComponent(token)}`;

  // Create Verani client
  const client = new VeraniClient(wsUrl, {
    reconnection: {
      enabled: true,
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 10000,
    },
  });

  // Setup lifecycle callbacks
  client.onOpen(() => {
    clearScreen();
    render();
    showNotification("Connected!", "success");
  });

  client.onClose((event) => {
    clearScreen();
    console.log(`${colors.red}✗ Disconnected: ${event.reason || "Unknown reason"}${colors.reset}`);
  });

  client.onError((error) => {
    clearScreen();
    console.error(`${colors.red}✗ Error:${colors.reset}`, error);
  });

  client.onStateChange((connectionState) => {
    if (connectionState === "connecting") {
      clearScreen();
      render();
      console.log(`${colors.yellow}⟳ Reconnecting...${colors.reset}`);
    } else if (connectionState === "connected") {
      clearScreen();
      render();
      showNotification("Reconnected!", "success");
    }
  });

  // Handle presence sync (always from storage - source of truth)
  client.on("presence.sync", (data: {
    users: Array<{ userId: string; username: string; status: string; devices: number }>;
    totalUsers: number;
    totalConnections: number;
  }) => {
    // Clear and rebuild state from sync (authoritative)
    state.users.clear();
    state.totalUsers = data.totalUsers;
    state.totalConnections = data.totalConnections;

    for (const user of data.users) {
      state.users.set(user.userId, {
        userId: user.userId,
        username: user.username,
        status: user.status as "online" | "away" | "busy",
        devices: user.devices,
      });
    }

    // Immediate render for sync (critical state update)
    clearScreen();
    render();
  });

  // Handle user coming online
  client.on("presence.online", (data: {
    userId: string;
    username: string;
    status: string;
    devices: number;
  }) => {
    state.users.set(data.userId, {
      userId: data.userId,
      username: data.username,
      status: data.status as "online" | "away" | "busy",
      devices: data.devices,
    });

    // Update totals
    state.totalUsers = state.users.size;
    state.totalConnections += data.devices;

    clearScreen();
    render();
    showNotification(`${data.username} is now online`, "success");
  });

  // Handle user going offline
  client.on("presence.offline", (data: { userId: string; username: string }) => {
    const user = state.users.get(data.userId);
    if (user) {
      state.totalConnections -= user.devices;
    }
    state.users.delete(data.userId);
    state.totalUsers = state.users.size;

    clearScreen();
    render();
    showNotification(`${data.username} went offline`, "info");
  });

  // Handle presence update (device count change)
  client.on("presence.update", (data: { userId: string; devices: number }) => {
    const user = state.users.get(data.userId);
    if (user) {
      const deviceDiff = data.devices - user.devices;
      user.devices = data.devices;
      state.totalConnections += deviceDiff;
      // Use debounced render for rapid updates
      debouncedRender();
    }
  });

  // Handle status change
  client.on("presence.status", (data: { userId: string; status: string }) => {
    const user = state.users.get(data.userId);
    if (user) {
      user.status = data.status as "online" | "away" | "busy";
      // Use debounced render for status updates
      debouncedRender();
    }
  });

  // Keep the client running (it will auto-update as events come in)
}

main().catch(console.error);

