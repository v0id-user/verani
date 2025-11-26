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

    // Send current online users to the new user
    const onlineUsers = ctx.actor.getConnectedUserIds();
    ctx.ws.send(JSON.stringify({
      type: "users.sync",
      data: {
        users: onlineUsers,
        count: onlineUsers.length
      }
    }));

    // Notify others about new user
    ctx.actor.broadcast("default", {
      type: "user.joined",
      userId: ctx.meta.userId,
      username: ctx.meta.username,
      timestamp: Date.now()
    }, { except: ctx.ws });

    // Send welcome message to new user
    ctx.ws.send(JSON.stringify({
      type: "system.message",
      data: {
        text: `Welcome to the chat, ${ctx.meta.username}!`,
        timestamp: Date.now()
      }
    }));
  },

  onMessage(ctx, frame) {
    switch (frame.type) {
      case "chat.message": {
        const { text } = frame.data;

        // Validate message
        if (!text || typeof text !== "string") {
          ctx.ws.send(JSON.stringify({
            type: "error",
            data: { message: "Invalid message format" }
          }));
          return;
        }

        if (text.length > 1000) {
          ctx.ws.send(JSON.stringify({
            type: "error",
            data: { message: "Message too long (max 1000 chars)" }
          }));
          return;
        }

        // Sanitize and broadcast
        const sanitized = text.trim();
        ctx.actor.broadcast("default", {
          type: "chat.message",
          from: ctx.meta.userId,
          username: ctx.meta.username,
          text: sanitized,
          timestamp: Date.now()
        });

        console.log(`[Chat] ${ctx.meta.username}: ${sanitized}`);
        break;
      }

      case "chat.typing": {
        // Broadcast typing indicator (except to sender)
        ctx.actor.broadcast("default", {
          type: "chat.typing",
          from: ctx.meta.userId,
          username: ctx.meta.username,
          timestamp: Date.now()
        }, { except: ctx.ws });
        break;
      }

      case "users.list": {
        // Send current user list
        const onlineUsers = ctx.actor.getConnectedUserIds();
        ctx.ws.send(JSON.stringify({
          type: "users.sync",
          data: {
            users: onlineUsers,
            count: onlineUsers.length
          }
        }));
        break;
      }

      default:
        console.warn(`[Chat] Unknown message type: ${frame.type}`);
    }
  },

  onDisconnect(ctx) {
    console.log(`[Chat] ${ctx.meta.username} disconnected`);

    // Notify others about user leaving
    ctx.actor.broadcast("default", {
      type: "user.left",
      userId: ctx.meta.userId,
      username: ctx.meta.username,
      timestamp: Date.now()
    });
  },

  onError(error, ctx) {
    console.error(`[Chat] Error for ${ctx.meta.username}:`, error);
  }
});

