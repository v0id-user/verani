# Installation

## Prerequisites

- Node.js 18+ or Bun
- A Cloudflare account (free tier works)

## Install Verani

```bash
npm install verani @cloudflare/actors
# or
bun add verani @cloudflare/actors
```

## Create Cloudflare Worker Project

If you don't have a Cloudflare Worker project yet:

```bash
npm create cloudflare@latest my-verani-app
cd my-verani-app
```

When prompted, choose:
- **Template**: "Hello World" or "Common"
- **Do NOT use** `--platform=pages` (that's for Pages, not Workers)

This creates:
- `src/index.ts` - Your Worker entry point
- `wrangler.jsonc` or `wrangler.toml` - Configuration
- `package.json` - Dependencies

## Next Steps

- [Quick Start Guide](./quick-start.md) - Build your first app
- [Troubleshooting](./troubleshooting.md) - Common issues
