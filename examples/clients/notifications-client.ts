#!/usr/bin/env bun
/**
 * Notifications Client Example
 *
 * Demonstrates personal notification feed using VeraniClient SDK
 *
 * Usage:
 *   bun run examples/clients/notifications-client.ts
 *
 * Each instance generates a random username and simulates notifications every 10 seconds.
 * Open multiple terminals to see multi-device synchronization!
 *
 * Features:
 * - Personal notification feed
 * - Real-time push notifications
 * - Read/unread tracking
 * - Multi-device synchronization
 * - Auto-simulated notifications (demo)
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
};

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  userId: string;
  notifications: Map<string, Notification>;
  deviceCount: number;
}

const state: NotificationState = {
  userId: "",
  notifications: new Map(),
  deviceCount: 0,
};

let notificationIdCounter = 0;

/**
 * Clears the screen
 */
function clearScreen() {
  console.clear();
}

/**
 * Gets notification icon and color
 */
function getNotificationDisplay(type: string): { icon: string; color: string } {
  switch (type) {
    case "info":
      return { icon: "ℹ️ ", color: colors.blue };
    case "success":
      return { icon: "✅", color: colors.green };
    case "warning":
      return { icon: "⚠️ ", color: colors.yellow };
    case "error":
      return { icon: "❌", color: colors.red };
    default:
      return { icon: "📬", color: colors.gray };
  }
}

/**
 * Formats a timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

/**
 * Renders the notifications UI
 */
function render() {
  clearScreen();

  console.log(`${colors.bright}${colors.magenta}🔔 Notifications Feed${colors.reset}`);
  console.log(`${colors.gray}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  // Header
  const unreadCount = Array.from(state.notifications.values()).filter(n => !n.read).length;
  const deviceText = state.deviceCount === 1 ? "1 device" : `${state.deviceCount} devices`;

  console.log(`${colors.bright}User:${colors.reset} ${state.userId} ${colors.gray}(${deviceText})${colors.reset}`);
  console.log(`${colors.bright}Notifications:${colors.reset} ${state.notifications.size} total, ${colors.magenta}${unreadCount} unread${colors.reset}\n`);

  // Notifications list
  if (state.notifications.size === 0) {
    console.log(`  ${colors.gray}📭 No notifications yet${colors.reset}`);
    console.log(`  ${colors.dim}Use 'simulate' to create a test notification${colors.reset}\n`);
  } else {
    const sorted = Array.from(state.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const notif of sorted) {
      const { icon, color } = getNotificationDisplay(notif.type);
      const readIndicator = notif.read ? "" : ` ${colors.magenta}●${colors.reset}`;

      console.log(`  ${icon} ${color}${notif.title}${colors.reset}${readIndicator}`);
      console.log(`     ${notif.message}`);
      console.log(`     ${colors.gray}${formatTime(notif.timestamp)} • ID: ${notif.id}${colors.reset}`);
      console.log();
    }
  }

  // Commands
  console.log(`${colors.gray}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}Commands:${colors.reset}`);
  console.log(`  ${colors.cyan}read <id>${colors.reset}      - Mark notification as read`);
  console.log(`  ${colors.cyan}read-all${colors.reset}       - Mark all notifications as read`);
  console.log(`  ${colors.cyan}delete <id>${colors.reset}    - Delete a notification`);
  console.log(`  ${colors.cyan}simulate${colors.reset}       - Simulate a new notification`);
  console.log(`  ${colors.cyan}refresh${colors.reset}        - Refresh the display`);
  console.log(`  ${colors.cyan}quit${colors.reset}           - Exit`);
  console.log();
}

/**
 * Shows a toast notification
 */
function showToast(notification: Notification) {
  const { icon, color } = getNotificationDisplay(notification.type);
  console.log();
  console.log(`${colors.bright}${color}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${color}║${colors.reset} ${icon} ${colors.bright}${notification.title}${colors.reset}`);
  console.log(`${colors.bright}${color}║${colors.reset} ${notification.message}`);
  console.log(`${colors.bright}${color}╚════════════════════════════════════════════════╝${colors.reset}`);
  console.log();
}

/**
 * Generates a random demo notification
 */
function generateDemoNotification(): Notification {
  const types = ["info", "success", "warning", "error"];
  const titles = ["New Message", "Update Available", "Warning", "Error Occurred"];
  const messages = [
    "You have a new message",
    "Version 2.0 is available",
    "Your session will expire soon",
    "Failed to save changes"
  ];

  const index = Math.floor(Math.random() * types.length);
  return {
    id: `notif-${notificationIdCounter++}`,
    type: types[index] as "info" | "success" | "warning" | "error",
    title: titles[index],
    message: messages[index],
    timestamp: Date.now(),
    read: false
  };
}

/**
 * Main function
 */
async function main() {
  // Generate a random username for this session
  const username = `user-${crypto.randomUUID().slice(0, 8)}`;
  const token = `user:${username}`;
  state.userId = username;

  clearScreen();
  console.log(`${colors.bright}🔔 Notifications Client${colors.reset}`);
  console.log(`${colors.gray}Connecting as ${username}...${colors.reset}\n`);

  // Build WebSocket URL
  const wsUrl = `ws://localhost:8787/ws/notifications?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(username)}`;

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
    render();

    // Simulate notifications every 10 seconds for demo
    const simulateInterval = setInterval(() => {
      if (!client.isConnected()) {
        clearInterval(simulateInterval);
        return;
      }

      const notification = generateDemoNotification();
      state.notifications.set(notification.id, notification);
      showToast(notification);
      render();
    }, 10000);

    // Auto-mark first notification as read after 5 seconds
    setTimeout(() => {
      const firstNotif = Array.from(state.notifications.values())[0];
      if (firstNotif && client.isConnected()) {
        console.log(`${colors.dim}[Auto-marking first notification as read...]${colors.reset}`);
        client.emit("notification.read", { notificationId: firstNotif.id });
      }
    }, 5000);
  });

  client.onClose((event) => {
    clearScreen();
    console.log(`${colors.red}✗ Disconnected: ${event.reason || "Unknown reason"}${colors.reset}`);
  });

  client.onError((error) => {
    console.error(`${colors.red}✗ Error:${colors.reset}`, error);
  });

  client.onStateChange((connectionState) => {
    if (connectionState === "connecting") {
      clearScreen();
      console.log(`${colors.yellow}⟳ Reconnecting...${colors.reset}`);
    } else if (connectionState === "connected") {
      render();
    }
  });

  // Handle notifications sync
  client.on("notifications.sync", (data: { notifications: Notification[] }) => {
    for (const notif of data.notifications) {
      state.notifications.set(notif.id, notif);
    }
    render();
  });

  // Handle new notification
  client.on("notification.new", (data: Notification) => {
    state.notifications.set(data.id, data);
    showToast(data);
    render();
  });

  // Handle notification read
  client.on("notification.read", (data: { notificationId: string }) => {
    const notif = state.notifications.get(data.notificationId);
    if (notif) {
      notif.read = true;
      render();
    }
  });

  // Handle all notifications read
  client.on("notification.readAll", () => {
    for (const notif of state.notifications.values()) {
      notif.read = true;
    }
    render();
    console.log(`${colors.green}✓ All notifications marked as read${colors.reset}`);
  });

  // Handle notification deleted
  client.on("notification.deleted", (data: { notificationId: string }) => {
    state.notifications.delete(data.notificationId);
    render();
    console.log(`${colors.green}✓ Notification deleted${colors.reset}`);
  });

  // Handle device connected/disconnected
  client.on("device.connected", (data: { deviceCount: number }) => {
    state.deviceCount = data.deviceCount;
    render();
  });

  client.on("device.disconnected", (data: { deviceCount: number }) => {
    state.deviceCount = data.deviceCount;
    render();
  });

  // Keep the client running (it will auto-update as events come in)
}

main().catch(console.error);

