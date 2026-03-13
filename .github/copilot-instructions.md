# Verani — GitHub Copilot Instructions

Verani is a realtime SDK for Cloudflare Actors (Durable Objects) with Socket.io-like semantics. This is a **library**, not an app.

## Tech Stack

- **Runtime:** Cloudflare Workers, Durable Objects (Actors)
- **Language:** TypeScript
- **Package manager:** bun (lockfile: `bun.lock`) — use `bun`, never npm/yarn
- **Build:** tsdown → `dist/`
- **Tests:** vitest with `@cloudflare/vitest-pool-workers`

## Architecture

- **ConnectionDO** — One per user. Owns a single WebSocket, session metadata, room membership (persisted).
- **RoomDO** — One per room. Coordinates membership and message fanout via RPC. No WebSockets.
- **Hibernation** — Actors hibernate when idle. Use WebSocket attachments and persisted state; re-join RoomDOs on wake.

## Commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` |
| Build library | `bun run build` |
| Run tests | `bun run test` |
| Unit tests only | `bun run test:unit` |
| Generate types | `bun run cf-typegen` |

## Code Style

- Follow existing patterns in the file you're editing.
- No extra comments a human wouldn't write.
- No defensive try/catch unless the callsite genuinely needs it.
- No `as any` casts to work around type issues — fix the types.
- No over-engineering: only add what's directly needed.

## Commit Conventions

- **Format:** `type(scope): message` — subject line only, no body.
- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **Split commits by logical unit.** One fix per commit, one feature per commit, docs separate from code. Never squash unrelated changes into one commit.
- Before committing, review the diff and remove AI slop (extra comments, defensive checks, `as any` casts, style inconsistencies).
- **Always commit.** After making changes, commit them following the conventions above. Do not leave uncommitted work. Split into multiple commits by logical unit.

## Hard Rules

- DO bindings in `wrangler.jsonc` must match actual exports. Active DOs: `UserConnection`, `PresenceRoom`, `ChatRoom`.
- Always use `bun` — never npm or yarn.
- Docs site (`site/`) is a separate workspace.

## Folder Structure

- `src/` — Core library (actor/, client/, shared/, typed/)
- `examples/` — Example apps and server definitions
- `site/` — Documentation site (separate workspace)
