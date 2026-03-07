---
name: cloud-agents-starter
description: Day-0 run and test playbook for Cloud agents in this Verani repo.
---

# Cloud Agents Starter Skill (Verani)

Use this when you need to quickly run, debug, and test this codebase in Cloud environments.

## 1) One-time auth and setup

1. Verify toolchain:
   - `node -v` (Node 18+ recommended)
   - `bun -v`
2. Install deps from repo root:
   - `bun install`
3. Authenticate Wrangler (required for deploys, optional for local dev/test):
   - `bunx wrangler login`
   - `bunx wrangler whoami`

Notes:
- Local development (`wrangler dev`) and tests can run without deploy auth in most cases.
- Keep secrets in local files only (for example `.dev.vars`), never commit them.

## 2) Codebase area: core Worker + SDK (`src/`, `test/`, root `wrangler.jsonc`)

Primary use: run Worker locally, validate SDK behavior, run automated tests.

### Fast execution workflow

1. Start local Worker:
   - `bun run dev`
2. Smoke check HTTP route:
   - `curl -i http://localhost:8787/`
3. Run automated tests:
   - `bun run test`
4. Optional package build sanity check:
   - `bun run build`

### Practical test workflow (core)

1. In terminal A, run `bun run dev`.
2. In terminal B, confirm root route returns HTML content from examples page:
   - `curl -s http://localhost:8787/ | rg "Verani Examples|WebSocket Path"`
3. Run `bun run test` to validate Worker test harness.
4. If tests fail with an inline snapshot expecting `"Hello World!"`, treat it as a stale baseline in `test/index.spec.ts` and validate with runtime smoke checks until tests are updated.

## 3) Codebase area: realtime examples (`examples/`)

Primary use: end-to-end websocket behavior (chat, presence, typed echo).

### Identity and feature-flag mocking

There is no central feature-flag service in this repo. Use request params as practical test toggles:
- Identity token: `?token=user:<username>` (example: `?token=user:alice`)
- Direct identity: `?userId=<id>`
- Typed echo path: `/ws/echo?userId=<id>`

These are the fastest ways to mock users/devices and trigger different flows.

### Chat workflow

1. Terminal A: `bun run dev`
2. Terminal B: `bun run examples/clients/chat-client.ts`
3. Terminal C: run the same chat client again.
4. Expect both clients to print join/sync/message events.

### Presence workflow

1. Terminal A: `bun run dev`
2. Terminal B: `bun run examples/clients/presence-client.ts`
3. Terminal C: run presence client again.
4. Expect live presence dashboard updates (`online`, counts, device changes).

### Typed workflow

1. Terminal A: `bun run dev`
2. Terminal B: `bun run examples/typed/echo-client.ts`
3. Expect typed echo request/response output with no runtime type mismatch errors.

## 4) Codebase area: docs site (`site/`)

Primary use: build docs bundle and run docs Worker.

### Fast execution workflow

1. Build docs bundle only:
   - `bun --cwd=site run build:docs`
2. Start docs site:
   - `bun --cwd=site run dev`
3. Smoke check:
   - `curl -i http://localhost:8787/`

Note: root Worker and docs site both default to port 8787. Run one at a time unless you override ports.

### Practical test workflow (docs site)

1. Run `bun --cwd=site run build:docs` and confirm it generates `site/src/docs-data.ts`.
2. Start docs site with `bun --cwd=site run dev`.
3. Request home/docs routes with `curl` and verify a valid HTML response.

## 5) Common Cloud-agent workflow tips

- Start with the narrowest high-signal checks first:
  - unit/integration: `bun run test`
  - runtime smoke: `curl` against local Worker
  - end-to-end realtime: run 2 client terminals against local dev server
- If testing auth-like flows, prefer token mocking (`token=user:alice`) before adding external auth dependencies.
- For deploy checks:
  - root app: `bun run deploy`
  - docs site: `bun --cwd=site run deploy`

## 6) Keep this skill updated

When you discover a new reliable runbook step or debugging trick:

1. Add it to the relevant codebase area section above.
2. Include:
   - exact command(s)
   - expected output/behavior
   - when to use it
3. Re-run at least one command from each updated section to verify the instructions still work.
4. Keep entries short and practical; remove stale or flaky steps quickly.
