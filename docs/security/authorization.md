# Authorization

Authentication tells you **who** the user is. Authorization tells you **what they can do**.

## Role-Based Access Control (RBAC)

```typescript
interface AuthorizedMeta extends ConnectionMeta {
  role: "user" | "moderator" | "admin";
}

export const rbacRoom = defineRoom<AuthorizedMeta>({
  name: "rbac-room",
  websocketPath: "/ws",
  
  extractMeta(req) {
    // ... authenticate user ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      role: payload.role || "user"
    };
  }
});

// Register event handlers (socket.io-like)
rbacRoom.on("user.kick", (ctx, data) => {
  // Only moderators and admins can kick
  if (ctx.meta.role !== "moderator" && ctx.meta.role !== "admin") {
    ctx.emit.emit("error", { message: "Insufficient permissions" });
    return;
  }

  // Perform kick...
  const { targetUserId } = data;
  const sessions = ctx.actor.getUserSessions(targetUserId);
  sessions.forEach(ws => ws.close(1008, "Kicked by moderator"));

  ctx.actor.emit.to("default").emit("user.kicked", {
    userId: targetUserId,
    by: ctx.meta.userId
  });
});

rbacRoom.on("room.delete", (ctx, data) => {
  // Only admins can delete rooms
  if (ctx.meta.role !== "admin") {
    ctx.emit.emit("error", { message: "Admin access required" });
    return;
  }

  // Perform delete...
});
```

## Permission-Based Access Control

```typescript
interface PermissionMeta extends ConnectionMeta {
  permissions: Set<string>;
}

const PERMISSIONS = {
  SEND_MESSAGE: "message:send",
  DELETE_MESSAGE: "message:delete",
  BAN_USER: "user:ban",
  MANAGE_ROOM: "room:manage"
} as const;

export const permissionRoom = defineRoom<PermissionMeta>({
  name: "permission-room",
  websocketPath: "/ws",
  
  extractMeta(req) {
    // ... authenticate ...
    const permissions = new Set(payload.permissions || []);

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      permissions
    };
  }
});

// Register event handlers (socket.io-like)
permissionRoom.on("message.delete", (ctx, data) => {
  if (!ctx.meta.permissions.has(PERMISSIONS.DELETE_MESSAGE)) {
    ctx.emit.emit("error", { message: "Permission denied" });
    return;
  }

  // Perform delete...
});
```

## Resource-Level Authorization

Check if user owns/can access specific resources:

```typescript
export const resourceRoom = defineRoom({
  name: "resource-room",
  websocketPath: "/ws"
  // Register event handlers (socket.io-like)
});

resourceRoom.on("document.edit", async (ctx, data) => {
  const { documentId, changes } = data;

  // Check if user has access to this document
  const hasAccess = await checkDocumentAccess(
    ctx.meta.userId,
    documentId
  );

  if (!hasAccess) {
    ctx.emit.emit("error", { message: "Access denied" });
    return;
  }

  // Apply edits...
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Input Validation](./input-validation.md) - Validating user input
- [Security Checklist](./checklist.md) - Production security checklist

