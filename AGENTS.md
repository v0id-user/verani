# Agents

## Cursor Cloud specific instructions

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

- **`wrangler.jsonc` has stale DO bindings.** The config references `CounterActor`, `ChatExample`, `PresenceExample`, and `NotificationsExample` which are not exported from `src/index.ts`. `wrangler dev` will refuse to start until these are removed. The active DOs are `UserConnection`, `PresenceRoom`, and `ChatRoom`.
- **Test snapshots are outdated.** `test/index.spec.ts` expects `"Hello World!"` but the worker now returns an HTML info page. The test infrastructure (vitest + cloudflare workers pool) works correctly; the inline snapshots just need updating with `bun run test -- --run --update`.
- **RoomDO binding lookup fails at runtime.** The example `onConnect` hook tries to join a presence room, but the binding resolution inside `joinRoom()` throws "RoomDO binding not found". This is a pre-existing code issue, not an environment problem. WebSocket connections and message handling work fine otherwise.
- **Docs site** (`site/`) is a separate workspace. Run `cd site && bun run dev` to start it independently. It uses its own `wrangler.jsonc`.
- **No external services required.** Everything runs locally via wrangler/miniflare with built-in Durable Object simulation (SQLite-backed). No databases, Docker, or API keys needed.
