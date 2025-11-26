#!/usr/bin/env bun
/**
 * Chat Client Example
 * 
 * Demonstrates real-time chat using VeraniClient SDK
 * 
 * Usage:
 *   bun run examples/clients/chat-client.ts user:alice
 * 
 * Features:
 * - Real-time message broadcasting
 * - Typing indicators
 * - Online user list
 * - Interactive CLI interface
 */

import { VeraniClient } from "../../src/client/client";
import * as readline from "readline";

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
 * Clears the current line and moves cursor to beginning
 */
function clearLine() {
  process.stdout.write("\r\x1b[K");
}

/**
 * Prints a message to console
 */
function printMessage(from: string, text: string, timestamp: number, isOwn = false) {
  clearLine();
  const time = `${colors.gray}[${formatTime(timestamp)}]${colors.reset}`;
  
  if (isOwn) {
    console.log(`${time} ${colors.blue}${from}:${colors.reset} ${text}`);
  } else {
    console.log(`${time} ${colors.green}${from}:${colors.reset} ${text}`);
  }
  
  showPrompt();
}

/**
 * Prints a system message
 */
function printSystem(text: string) {
  clearLine();
  console.log(`${colors.gray}* ${text}${colors.reset}`);
  showPrompt();
}

/**
 * Shows the input prompt
 */
function showPrompt() {
  process.stdout.write(`${colors.cyan}>${colors.reset} `);
}

/**
 * Updates the typing indicator display
 */
function updateTypingIndicator() {
  if (state.typingUsers.size === 0) return;
  
  clearLine();
  const users = Array.from(state.typingUsers).join(", ");
  const verb = state.typingUsers.size === 1 ? "is" : "are";
  console.log(`${colors.gray}${users} ${verb} typing...${colors.reset}`);
  showPrompt();
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const token = args[0];

  if (!token || !token.startsWith("user:")) {
    console.error(`${colors.red}Error: Please provide a token in format 'user:username'${colors.reset}`);
    console.error(`Usage: bun run examples/clients/chat-client.ts user:alice`);
    process.exit(1);
  }

  state.username = token.split(":")[1] || token;

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
    showPrompt();
  });

  client.onClose((event) => {
    console.log(`\n${colors.red}✗ Disconnected: ${event.reason || "Unknown reason"}${colors.reset}`);
  });

  client.onError((error) => {
    console.error(`${colors.red}✗ Error:${colors.reset}`, error);
  });

  client.onStateChange((state) => {
    if (state === "connecting") {
      clearLine();
      console.log(`${colors.yellow}⟳ Reconnecting...${colors.reset}`);
    } else if (state === "connected") {
      clearLine();
      console.log(`${colors.green}✓ Reconnected!${colors.reset}`);
      showPrompt();
    }
  });

  // Handle incoming messages
  client.on("users.sync", (data: { users: string[]; count: number }) => {
    state.onlineUsers = data.users;
    clearLine();
    console.log(`${colors.gray}Online users (${data.count}): ${data.users.join(", ")}${colors.reset}`);
    showPrompt();
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
    clearLine();
    console.log(`${colors.red}Error: ${data.message}${colors.reset}`);
    showPrompt();
  });

  // Setup readline for interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "",
  });

  let lastTypingTime = 0;
  const TYPING_THROTTLE = 2000; // Send typing indicator at most every 2 seconds

  rl.on("line", (line) => {
    const text = line.trim();
    
    if (!text) {
      showPrompt();
      return;
    }

    // Handle special commands
    if (text === "/quit" || text === "/exit") {
      console.log(`\n${colors.gray}Goodbye!${colors.reset}`);
      client.close();
      process.exit(0);
    }

    if (text === "/users") {
      clearLine();
      console.log(`${colors.gray}Online users (${state.onlineUsers.length}): ${state.onlineUsers.join(", ")}${colors.reset}`);
      showPrompt();
      return;
    }

    if (text === "/help") {
      clearLine();
      console.log(`${colors.bright}Commands:${colors.reset}`);
      console.log(`  /users - List online users`);
      console.log(`  /quit  - Exit chat`);
      console.log(`  /help  - Show this help`);
      showPrompt();
      return;
    }

    // Send message
    if (client.isConnected()) {
      client.emit("chat.message", { text });
    } else {
      clearLine();
      console.log(`${colors.red}✗ Not connected. Message queued.${colors.reset}`);
      client.emit("chat.message", { text }); // Will be queued
      showPrompt();
    }
  });

  // Send typing indicator as user types
  process.stdin.on("data", () => {
    const now = Date.now();
    if (now - lastTypingTime > TYPING_THROTTLE) {
      lastTypingTime = now;
      if (client.isConnected()) {
        client.emit("chat.typing", {});
      }
    }
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log(`\n${colors.gray}Disconnecting...${colors.reset}`);
    client.close();
    process.exit(0);
  });

  // Show help
  console.log(`${colors.gray}Type a message and press Enter to send.${colors.reset}`);
  console.log(`${colors.gray}Type /help for commands.${colors.reset}\n`);
}

main().catch(console.error);

