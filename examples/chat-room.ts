import { defineRoom } from "../src/verani";
import type { ConnectionMeta } from "../src/verani";

/**
 * Extended metadata for chat room connections
 */
interface ChatMeta extends ConnectionMeta {
  username: string;
  joinedAt: number;
}

/**
 * Simple token validation (in production, use proper JWT verification)
 */
function validateToken(token: string): { userId: string; username: string } | null {
  // For demo purposes, accept any token in format "user:username"
  // In production, verify JWT signature
  const parts = token.split(":");
  if (parts.length === 2 && parts[0] === "user") {
    return {
      userId: parts[1],
      username: parts[1]
    };
  }
  return null;
}

/**
 * Chat Room Example
 *
 * Features:
 * - User authentication
 * - Message broadcasting
 * - Typing indicators
 * - Online user list
 * - Join/leave notifications
 */
export const chatRoom = defineRoom<ChatMeta>({
  name: "chat-example",
  websocketPath: "/ws/chat",

  extractMeta(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Authentication required");
    }

    const user = validateToken(token);
    if (!user) {
      throw new Error("Invalid token");
    }

    return {
      userId: user.userId,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      username: user.username,
      joinedAt: Date.now()
    };
  },

  onConnect(ctx) {
    console.log(`[Chat] ${ctx.meta.username} connected`);

    // Send current online users to the new user using emit API
    const onlineUsers = ctx.actor.getConnectedUserIds();
    ctx.emit.emit("users.sync", {
      users: onlineUsers,
      count: onlineUsers.length
    });

    // Notify others about new user using emit API
    ctx.actor.emit.to("default").emit("user.joined", {
      userId: ctx.meta.userId,
      username: ctx.meta.username,
      timestamp: Date.now()
    });

    // Send welcome message to new user using emit API
    ctx.emit.emit("system.message", {
      text: `Welcome to the chat, ${ctx.meta.username}!`,
      timestamp: Date.now()
    });
  },

  onDisconnect(ctx) {
    console.log(`[Chat] ${ctx.meta.username} disconnected`);

    // Notify others about user leaving using emit API
    ctx.actor.emit.to("default").emit("user.left", {
      userId: ctx.meta.userId,
      username: ctx.meta.username,
      timestamp: Date.now()
    });
  },

  onError(error, ctx) {
    console.error(`[Chat] Error for ${ctx.meta.username}:`, error);
  }
});

// Register event handlers (socket.io-like)
chatRoom.on("chat.message", (ctx, data) => {
  const { text } = data;

  // Validate message
  if (!text || typeof text !== "string") {
    ctx.emit.emit("error", { message: "Invalid message format" });
    return;
  }

  if (text.length > 1000) {
    ctx.emit.emit("error", { message: "Message too long (max 1000 chars)" });
    return;
  }

  // Sanitize and broadcast using emit API
  const sanitized = text.trim();
  ctx.actor.emit.to("default").emit("chat.message", {
    from: ctx.meta.userId,
    username: ctx.meta.username,
    text: sanitized,
    timestamp: Date.now()
  });

  console.log(`[Chat] ${ctx.meta.username}: ${sanitized}`);
});

chatRoom.on("chat.typing", (ctx, data) => {
  // Broadcast typing indicator using emit API
  ctx.actor.emit.to("default").emit("chat.typing", {
    from: ctx.meta.userId,
    username: ctx.meta.username,
    timestamp: Date.now()
  });
});

chatRoom.on("users.list", (ctx, data) => {
  // Send current user list using emit API
  const onlineUsers = ctx.actor.getConnectedUserIds();
  ctx.emit.emit("users.sync", {
    users: onlineUsers,
    count: onlineUsers.length
  });
});

