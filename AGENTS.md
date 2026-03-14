# Agents

## Overview

Verani is a realtime SDK for Cloudflare Actors (Durable Objects) with Socket.io-like semantics. This is a **library**, not an app.

## AI Rules Configuration

Project semantics are defined per tool:

| Tool | Location |
|------|----------|
| **Claude** | `CLAUDE.md` |
| **Cursor** | `.cursor/rules/` — `verani-context.mdc`, `anti-slop.mdc`, `verani-commits.mdc`, and file-specific rules |
| **GitHub Copilot** | `.github/copilot-instructions.md` |
| **Windsurf** | `.windsurfrules` |

All rule files share the same project semantics. If you update one, update the others to stay in sync.

## Tech Stack

- **Runtime:** Cloudflare Workers, Durable Objects (Actors)
- **Language:** TypeScript
- **Package manager:** bun (lockfile: `bun.lock`) — **always** use `bun`, never npm/yarn
- **Build:** tsdown → `dist/`
- **Tests:** vitest with `@cloudflare/vitest-pool-workers`

## Commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` (starts wrangler on `localhost:8787`) |
| Build library | `bun run build` (tsdown → `dist/`) |
| Run tests | `bun run test` |
| Unit tests only | `bun run test:unit` |
| Generate types | `bun run cf-typegen` |
| Docs dev | `cd site && bun run dev` |
| Deploy docs | Auto-deploys via Cloudflare Workers Builds on push to `canary` |
| Deploy docs (manual) | `cd site && bun run deploy` |
| Bump version | `bun x @nyron/cli bump --type patch\|minor\|major` |
| Push release tag | `bun x @nyron/cli push-tag` |

## Architecture

- **ConnectionDO** — One per user. Owns a single WebSocket, session metadata, room membership (persisted).
- **RoomDO** — One per room. Coordinates membership and message fanout via RPC. No WebSockets.
- **Hibernation** — Actors hibernate when idle. Use WebSocket attachments and persisted state; re-join RoomDOs on wake.

## Commit Conventions

**Format:** `type(scope): message` — subject line only, no body.

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Scope:** Optional. Use when helpful: `actor`, `client`, `typed`, `examples`, `docs`, etc.

### Split Commits — Critical Rule

**No slop commits. Do not squash everything into one big commit.**

Split by logical unit:
- One fix per commit
- One feature per commit
- Docs separate from code
- Config changes separate from logic
- Test additions separate from implementation

A PR with many small, focused commits is **always** better than one commit containing unrelated changes. Each commit should be independently reviewable and make sense on its own.

### Before Committing

Review the diff and apply anti-slop rules:
- Remove extra comments a human wouldn't write
- Remove defensive try/catch that isn't needed
- Remove `as any` casts — fix the types instead
- Remove any style inconsistent with the file

### Always Commit

After making changes, commit them following the conventions above. Do not leave uncommitted work. Split into multiple commits by logical unit.

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

## Code Style

- Follow existing patterns in the file you're editing.
- No over-engineering: only add what's directly needed.
- No extra comments, no redundant error handling, no `as any` workarounds.

## Hard Rules

- DO bindings in `wrangler.jsonc` must match actual exports. Active DOs: `UserConnection`, `PresenceRoom`, `ChatRoom`.
- Always use `bun` — never npm or yarn.
- Docs site (`site/`) is a separate workspace.

## Gotchas

- **`wrangler.jsonc`** — Remove stale DO bindings or wrangler dev fails.
- **Test snapshots** — Update with `bun run test -- --run --update` if outdated.
- **RoomDO binding** — Example `onConnect` may throw "RoomDO binding not found"; WebSocket handling works otherwise.
- **No external services** — Everything runs locally via wrangler/miniflare (SQLite-backed DO simulation).

## Folder Structure

- `src/` — Core library (actor/, client/, shared/, typed/)
- `examples/` — Example apps and server definitions
- `site/` — Documentation site (separate workspace, deploys to Cloudflare Workers)
