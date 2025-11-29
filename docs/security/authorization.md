# Authorization

Authentication tells you **who** the user is. Authorization tells you **what they can do**.

## Role-Based Access Control (RBAC)

```typescript
interface AuthorizedMeta extends ConnectionMeta {
  role: "user" | "moderator" | "admin";
}

export const rbacRoom = defineRoom<AuthorizedMeta>({
  extractMeta(req) {
    // ... authenticate user ...
    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      role: payload.role || "user"
    };
  },

  onMessage(ctx, frame) {
    // Check permissions for sensitive actions
    if (frame.type === "user.kick") {
      // Only moderators and admins can kick
      if (ctx.meta.role !== "moderator" && ctx.meta.role !== "admin") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Insufficient permissions" }
        }));
        return;
      }

      // Perform kick...
    }

    if (frame.type === "room.delete") {
      // Only admins can delete rooms
      if (ctx.meta.role !== "admin") {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Admin access required" }
        }));
        return;
      }

      // Perform delete...
    }
  }
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
  extractMeta(req) {
    // ... authenticate ...
    const permissions = new Set(payload.permissions || []);

    return {
      userId: payload.sub,
      clientId: crypto.randomUUID(),
      channels: ["default"],
      permissions
    };
  },

  onMessage(ctx, frame) {
    if (frame.type === "message.delete") {
      if (!ctx.meta.permissions.has(PERMISSIONS.DELETE_MESSAGE)) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Permission denied" }
        }));
        return;
      }

      // Perform delete...
    }
  }
});
```

## Resource-Level Authorization

Check if user owns/can access specific resources:

```typescript
export const resourceRoom = defineRoom({
  onMessage(ctx, frame) {
    if (frame.type === "document.edit") {
      const { documentId, changes } = frame.data;

      // Check if user has access to this document
      const hasAccess = await checkDocumentAccess(
        ctx.meta.userId,
        documentId
      );

      if (!hasAccess) {
        ctx.ws.send(JSON.stringify({
          type: "error",
          data: { message: "Access denied" }
        }));
        return;
      }

      // Apply edits...
    }
  }
});
```

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Input Validation](./input-validation.md) - Validating user input
- [Security Checklist](./checklist.md) - Production security checklist

