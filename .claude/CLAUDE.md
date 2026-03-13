# Verani — Project Instructions for Claude

Verani is a small, focused realtime SDK for Cloudflare Actors (Durable Objects) with Socket.io-like semantics. This is a **library**, not an app.

## Tech Stack

- **Runtime:** Cloudflare Workers, Durable Objects (Actors)
- **Language:** TypeScript
- **Package manager:** bun (lockfile: `bun.lock`) — use `bun`, never npm
- **Build:** tsdown → `dist/`
- **Tests:** vitest with `@cloudflare/vitest-pool-workers`

## Architecture

- **ConnectionDO** — One per user. Owns a single WebSocket, session metadata, room membership (persisted).
- **RoomDO** — One per room. Coordinates membership and message fanout via RPC. No WebSockets.
- **Hibernation** — Actors hibernate when idle. Use WebSocket attachments and persisted state; re-join RoomDOs on wake.

**Backend API:** `defineConnection`, `createConnectionHandler`, `createRoomHandler`
**Client API:** `VeraniClient` with `on(event, handler)` / `emit(event, payload)`

## Commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` (localhost:8787) |
| Build library | `bun run build` |
| Run tests | `bun run test` |
| Generate types | `bun run cf-typegen` |

## Hard Rules

- **NEVER** add DO bindings that don't match exports. Active DOs: `UserConnection`, `PresenceRoom`, `ChatRoom`.
- **ALWAYS** use `bun` for install/run, not npm or yarn.
- **Docs site** (`site/`) is a separate workspace — run `cd site && bun run dev` independently.

## Gotchas

- **wrangler.jsonc** — Remove stale bindings (CounterActor, ChatExample, etc.) or wrangler dev fails.
- **Test snapshots** — May be outdated; update with `bun run test -- --run --update`.
- **RoomDO binding** — Example `onConnect` may throw "RoomDO binding not found"; WebSocket handling works otherwise.
- **No external services** — Everything runs locally via wrangler/miniflare (SQLite-backed DO simulation).

## Folder Structure

- `src/` — Core library (actor/, client/, shared/, typed/)
- `examples/` — Example apps and server definitions
- `site/` — Documentation site (separate workspace)

## Code Style

- Avoid AI slop: no extra comments, defensive try/catch, or `as any` casts that are inconsistent with the file.
- Follow existing patterns; keep changes minimal and focused.

## Commit Conventions

- **Format:** Conventional commits — `type(scope): message`. Subject line only, no description/body.
- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **Keep commits small and focused.**
- **Split commits** — No slop commits. Do not squash everything into one big commit. Split by logical unit: one fix per commit, one feature per commit, docs separate from code.
- **Before committing:** Apply anti-slop rules — remove extra comments, defensive try/catch, `as any` casts, or style inconsistent with the file.
- **Always commit.** After making changes, commit them following the conventions above. Do not leave uncommitted work. Split into multiple commits by logical unit.
