# Installation

## Prerequisites

- Node.js 18+ or Bun
- A Cloudflare account (free tier works)
- Basic understanding of WebSockets

## Installation

```bash
npm install verani @cloudflare/actors
# or
bun add verani @cloudflare/actors
```

## Set Up Your Cloudflare Worker Project

If you don't have a Cloudflare Worker project yet, create one using [C3 (create-cloudflare)](https://developers.cloudflare.com/pages/get-started/c3/):

```bash
npm create cloudflare@latest my-verani-app
cd my-verani-app
```

**Important**: When prompted, choose:
- **Template type**: "Hello World" or "Common" (these are Worker templates)
- **Do NOT use** `--platform=pages` (that's for Cloudflare Pages, not Workers)

This will create a new Cloudflare Worker project with:
- `src/index.ts` - Your Worker entry point
- `wrangler.jsonc` or `wrangler.toml` - Wrangler configuration
- `package.json` - Dependencies

You can then install Verani and start building your realtime application!

## Next Steps

- [Quick Start Guide](./quick-start.md) - Build your first Verani application
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

