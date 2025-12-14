# Verani Documentation Site

A minimal black and white documentation site built with Bun, ElysiaJS, and deployed to Cloudflare Workers.

## Quick Start

1. Install dependencies:
   ```bash
   bun install
   ```

2. Run the development server:
   ```bash
   bun run dev
   ```

3. Open your browser to:
   ```
   http://localhost:8787
   ```

That's it. The site will automatically build the docs bundle and start the server.

## Commands

- `bun run dev` - Build docs bundle and start development server
- `bun run deploy` - Build docs bundle and deploy to Cloudflare Workers
- `bun run build:docs` - Build the docs bundle only (without starting server)

## How It Works

The documentation site reads markdown files from the `../docs/` directory and serves them as HTML.

At build time, a script (`scripts/build-docs.ts`) scans all markdown files and creates a bundled data file (`src/docs-data.ts`) that contains all the content and navigation structure.

At runtime, the Cloudflare Worker uses this bundled data to serve pages. This means no file system access is needed when the site is running.

## Project Structure

- `server.ts` - Main ElysiaJS server with Cloudflare Worker adapter
- `src/index.ts` - Cloudflare Worker entry point
- `src/docs-data.ts` - Auto-generated file containing all docs content (do not edit)
- `routes/docs.ts` - Route handlers for documentation pages
- `utils/markdown.ts` - Markdown rendering utilities
- `utils/navigation.ts` - Navigation tree utilities
- `utils/template.ts` - HTML template rendering
- `public/styles.css` - CSS styles (black and white, monospace font)
- `scripts/build-docs.ts` - Build script that bundles markdown files
- `wrangler.jsonc` - Cloudflare Workers configuration

## Deployment

To deploy to Cloudflare Workers:

1. Make sure you're logged in to Wrangler:
   ```bash
   npx wrangler login
   ```

2. Deploy:
   ```bash
   bun run deploy
   ```

The site will be available at your Cloudflare Workers URL (something like `https://verani-docs.your-subdomain.workers.dev`).

## Troubleshooting

If the site doesn't load, make sure:

1. You've run `bun install` to install dependencies
2. The docs bundle was built successfully (check if `src/docs-data.ts` exists)
3. Wrangler is properly configured (run `npx wrangler login` if needed)

If you make changes to markdown files in `../docs/`, you need to rebuild the bundle by running `bun run build:docs` or restarting the dev server.
