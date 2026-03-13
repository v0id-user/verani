# Agents

## AI Rules

Project semantics for Cursor and Claude are defined in:

- **Cursor:** `.cursor/rules/` — `verani-context.mdc`, `anti-slop.mdc`, `verani-commits.mdc`, and file-specific rules
- **Claude:** `.claude/CLAUDE.md`

## Cursor Cloud

### Overview

Verani is a realtime SDK for Cloudflare Actors (Durable Objects) with Socket.io-like semantics. The repo contains the core library (`src/`), example applications (`examples/`), and a documentation site (`site/`).

### Key commands

All commands use `bun` as the package manager (lockfile: `bun.lock`).

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` (starts wrangler on `localhost:8787`) |
| Build library | `bun run build` (tsdown → `dist/`) |
| Run tests | `bun run test` (vitest with `@cloudflare/vitest-pool-workers`) |
| Generate types | `bun run cf-typegen` |

### Gotchas

- **`wrangler.jsonc` has stale DO bindings.** Remove `CounterActor`, `ChatExample`, `PresenceExample`, `NotificationsExample`. Active DOs: `UserConnection`, `PresenceRoom`, `ChatRoom`.
- **Test snapshots** — Update with `bun run test -- --run --update` if outdated.
- **RoomDO binding** — Example `onConnect` may throw "RoomDO binding not found"; WebSocket handling works otherwise.
- **Docs site** (`site/`) — Separate workspace; run `cd site && bun run dev` independently.
- **No external services** — Local wrangler/miniflare with SQLite-backed DO simulation.
