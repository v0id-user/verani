#!/usr/bin/env bun
/**
 * Chat Client Example
 *
 * Demonstrates real-time chat using VeraniClient SDK
 *
 * Usage:
 *   bun run examples/clients/chat-client.ts
 *
 * Each instance generates a random username and automatically sends demo messages.
 * Open multiple terminals to see real-time message broadcasting!
 *
 * Features:
 * - Real-time message broadcasting
 * - Typing indicators
 * - Online user list
 * - Automatic message sending (demo)
 */

import { VeraniClient } from "../../src/client/client";
// ANSI color codes for better UX
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

interface ChatState {
  username: string;
  onlineUsers: string[];
  typingUsers: Set<string>;
}

const state: ChatState = {
  username: "",
  onlineUsers: [],
  typingUsers: new Set(),
};

/**
 * Formats a timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Prints a message to console
 */
function printMessage(from: string, text: string, timestamp: number, isOwn = false) {
  const time = `${colors.gray}[${formatTime(timestamp)}]${colors.reset}`;

  if (isOwn) {
    console.log(`${time} ${colors.blue}${from}:${colors.reset} ${text}`);
  } else {
    console.log(`${time} ${colors.green}${from}:${colors.reset} ${text}`);
  }
}

/**
 * Prints a system message
 */
function printSystem(text: string) {
  console.log(`${colors.gray}* ${text}${colors.reset}`);
}

/**
 * Updates the typing indicator display
 */
function updateTypingIndicator() {
  if (state.typingUsers.size === 0) return;

  const users = Array.from(state.typingUsers).join(", ");
  const verb = state.typingUsers.size === 1 ? "is" : "are";
  console.log(`${colors.gray}${users} ${verb} typing...${colors.reset}`);
}

/**
 * Main function
 */
async function main() {
  // Generate a random username for this session
  const username = `user-${crypto.randomUUID().slice(0, 8)}`;
  const token = `user:${username}`;
  state.username = username;

  console.log(`${colors.bright}💬 Chat Room Client${colors.reset}`);
  console.log(`${colors.gray}Connecting as ${state.username}...${colors.reset}\n`);

  // Build WebSocket URL
  const wsUrl = `ws://localhost:8787/ws/chat?token=${encodeURIComponent(token)}`;

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
    console.log(`${colors.green}✓ Connected!${colors.reset}\n`);

    // Send some demo messages
    setTimeout(() => {
      console.log(`${colors.dim}[Sending demo messages...]${colors.reset}`);
      client.emit("chat.message", { text: "Hello everyone! 👋" });
    }, 1000);

    setTimeout(() => {
      client.emit("chat.message", { text: "This is a demo chat client using Verani SDK" });
    }, 3000);

    setTimeout(() => {
      client.emit("chat.message", { text: "Open another terminal to see real-time sync!" });
    }, 5000);
  });

  client.onClose((event) => {
    console.log(`\n${colors.red}✗ Disconnected: ${event.reason || "Unknown reason"}${colors.reset}`);
  });

  client.onError((error) => {
    console.error(`${colors.red}✗ Error:${colors.reset}`, error);
  });

  client.onStateChange((connectionState) => {
    if (connectionState === "connecting") {
      console.log(`${colors.yellow}⟳ Reconnecting...${colors.reset}`);
    } else if (connectionState === "connected") {
      console.log(`${colors.green}✓ Reconnected!${colors.reset}`);
    }
  });

  // Handle incoming messages
  client.on("users.sync", (data: { users: string[]; count: number }) => {
    state.onlineUsers = data.users;
    console.log(`${colors.gray}Online users (${data.count}): ${data.users.join(", ")}${colors.reset}`);
  });

  client.on("user.joined", (data: { userId: string; username: string; timestamp: number }) => {
    state.onlineUsers.push(data.userId);
    printSystem(`${data.username} joined the chat`);
  });

  client.on("user.left", (data: { userId: string; username: string; timestamp: number }) => {
    state.onlineUsers = state.onlineUsers.filter(id => id !== data.userId);
    state.typingUsers.delete(data.username);
    printSystem(`${data.username} left the chat`);
  });

  client.on("chat.message", (data: { from: string; username: string; text: string; timestamp: number }) => {
    state.typingUsers.delete(data.username);
    const isOwn = data.username === state.username;
    printMessage(data.username, data.text, data.timestamp, isOwn);
  });

  client.on("chat.typing", (data: { from: string; username: string; timestamp: number }) => {
    state.typingUsers.add(data.username);

    // Clear typing indicator after 3 seconds
    setTimeout(() => {
      state.typingUsers.delete(data.username);
    }, 3000);

    updateTypingIndicator();
  });

  client.on("system.message", (data: { text: string; timestamp: number }) => {
    printSystem(data.text);
  });

  client.on("error", (data: { message: string }) => {
    console.log(`${colors.red}Error: ${data.message}${colors.reset}`);
  });

  // Keep the client running
  console.log(`${colors.gray}Demo client listening for messages...${colors.reset}\n`);
}

main().catch(console.error);

