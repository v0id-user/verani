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
| Bump version | `bun x @nyron/cli bump --type patch\|minor\|major` |
| Push release tag | `bun x @nyron/cli push-tag` |

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
- **Never use `any`.** Use `unknown`, proper generics, or type assertions with specific types instead.
- Follow existing patterns; keep changes minimal and focused.

## Cloudflare Workers / Durable Objects — Mandatory Rules

**READ THE CLOUDFLARE DOCS. DO NOT INVENT APIs.**

This project runs on Cloudflare Workers with Durable Objects. If you are unfamiliar with the Cloudflare Workers runtime, **stop and read the official documentation** before writing or modifying any code. Do not guess, hallucinate, or assume how Cloudflare APIs work based on other platforms.

**Specific rules:**
- **`DurableObjectNamespace.get()` requires a `DurableObjectId`, not a string.** Always call `ns.idFromName(name)` first, then pass the result to `ns.get(doId)`. Never pass a raw string to `.get()`. This is non-negotiable.
- **Do not confuse `Actor.get()` with `DurableObjectNamespace.get()`.** The `@cloudflare/actors` `Actor.get(id: string)` static method handles `idFromName` internally. The raw `DurableObjectNamespace.get()` from `env` bindings does not.
- **Do not add type overloads to "fix" type errors.** If the type checker rejects your code, the code is wrong — not the types. Never add permissive overloads (like `get(id: string)`) to silence errors.
- **Never silently swallow errors with empty `catch` blocks.** Especially in message delivery paths. If you catch, log or re-throw. A `catch { return 0 }` in a delivery path makes bugs invisible and undebuggable.
- **Tests must validate the actual Cloudflare API contract.** Mock bindings must include all methods used at runtime (`get`, `idFromName`, etc.). If your mocks accept raw strings where the real API requires `DurableObjectId`, your tests are worthless — they'll pass while production is broken.
- **Do not use `WebSocket.OPEN` or other globals from the Workers runtime in unit tests** that run outside workerd. Use local constants.

## Commit Conventions

- **Format:** Conventional commits — `type(scope): message`. Subject line only, no description/body.
- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **Keep commits small and focused.**
- **Split commits** — No slop commits. Do not squash everything into one big commit. Split by logical unit: one fix per commit, one feature per commit, docs separate from code.
- **Before committing:** Apply anti-slop rules — remove extra comments, defensive try/catch, `as any` casts, or style inconsistent with the file.
- **Always commit.** After making changes, commit them following the conventions above. Do not leave uncommitted work. Split into multiple commits by logical unit.

## Versioning (Nyron)

This project uses [Nyron](https://nyron.dev) for versioning, changelogs, and GitHub releases. **Never bump versions manually** — always use Nyron.

**Full release workflow:**
1. `bun x @nyron/cli bump --type patch|minor|major` — bumps `package.json` version, updates `.nyron/` state files
2. Commit the version bump: `chore: release v<version>`
3. `bun x @nyron/cli push-tag` — creates a `nyron-release@YYYY-MM-DD@HH-MM-SS.mmm` tag and pushes it to origin. Also updates `.nyron/meta.json` with the new `latestTag`.
4. Commit the state update: `chore(nyron): update state files after push-tag`
5. `bun x @nyron/cli release --use-existing-tag --dry-run` — preview changelog (commits between previous and current release tags)
6. `bun x @nyron/cli release --use-existing-tag` — publish GitHub Release (requires `GITHUB_TOKEN`)
7. `git push` — push commits to remote

**Rules:**
- Never edit `package.json` version, `.nyron/meta.json`, or `.nyron/versions.json` by hand.
- Never create version tags manually — Nyron manages them.
- Use `patch` for fixes, `minor` for features, `major` for breaking changes.
- The release workflow (`.github/workflows/release.yml`) runs automatically on `nyron-release@*` tags.

**Critical details (common mistakes):**
- **Do NOT modify `.nyron/` files before running `bump`.** Nyron reads the current version from `.nyron/meta.json` to compute the next version. If `meta.json` is modified (even by a linter/formatter) before `bump` runs, the version will be wrong.
- **`push-tag` modifies `.nyron/meta.json`** (updates `latestTag`). This change must be committed separately after running `push-tag`.
- **Release tags use timestamp format:** `nyron-release@YYYY-MM-DD@HH-MM-SS.mmm`. Never create tags with version numbers like `nyron-release@0.11.0` — Nyron won't recognize them.
- **Changelog needs two boundary tags.** `release --use-existing-tag` diffs commits between the previous and current `nyron-release@*` tags. If no previous tag exists (first release), create a retroactive base tag on the pre-release commit: `git tag "nyron-release@<ISO-timestamp>" <commit-hash>`, then push it.
- **`.nyron/meta.json` format:** `packages` is an array of objects with `prefix` and `version` fields (not `name` or `path` — those live in `nyron.config.ts`).
- **`.nyron/versions.json` format:** `packages` is an object keyed by project name, where each value is an array of version objects with `version`, `prefix`, and optionally `date` fields.
