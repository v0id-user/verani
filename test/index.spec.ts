import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Hello World worker', () => {
	it('responds with Hello World! (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`
			"<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Verani Examples</title>
				<style>
					body {
						font-family: system-ui, -apple-system, sans-serif;
						max-width: 800px;
						margin: 40px auto;
						padding: 0 20px;
						line-height: 1.6;
						color: #333;
					}
					h1 { color: #2563eb; }
					h2 { color: #1e40af; margin-top: 30px; }
					code {
						background: #f3f4f6;
						padding: 2px 6px;
						border-radius: 3px;
						font-family: 'Courier New', monospace;
					}
					pre {
						background: #1f2937;
						color: #f9fafb;
						padding: 15px;
						border-radius: 6px;
						overflow-x: auto;
					}
					pre code {
						background: none;
						color: inherit;
						padding: 0;
					}
					.example {
						background: #f9fafb;
						border-left: 4px solid #2563eb;
						padding: 15px;
						margin: 15px 0;
					}
					.config {
						background: #fef3c7;
						border-left: 4px solid #f59e0b;
						padding: 15px;
						margin: 15px 0;
					}
					a { color: #2563eb; text-decoration: none; }
					a:hover { text-decoration: underline; }
				</style>
			</head>
			<body>
				<h1>Verani Examples</h1>
				<p>Real-time SDK for Cloudflare Actors with Socket.io-like semantics and proper hibernation support.</p>

				<h2>Architecture</h2>
				<p>This example uses the <strong>per-connection architecture</strong> where each user gets their own ConnectionDO, with separate RoomDOs for coordination.</p>

				<div class="config">
					<h3>Current Configuration</h3>
					<ul>
						<li><strong>WebSocket Path:</strong> <code>/ws</code></li>
						<li><strong>Connection DO:</strong> <code>UserConnection</code></li>
						<li><strong>Presence Room DO:</strong> <code>PresenceRoom</code></li>
						<li><strong>Chat Room DO:</strong> <code>ChatRoom</code></li>
					</ul>
				</div>

				<h2>Running Examples</h2>
				<p>This worker provides WebSocket endpoints for the example rooms. To interact with them, use the TypeScript CLI clients.</p>

				<div class="example">
					<h3>Presence Tracking</h3>
					<pre><code>bun run examples/clients/presence-client.ts</code></pre>
					<p>Track who's online with multi-device support and status indicators.</p>
				</div>

				<div class="example">
					<h3>Chat Room</h3>
					<pre><code>bun run examples/clients/chat-client.ts</code></pre>
					<p>Real-time chat with typing indicators, online users, and message broadcasting.</p>
				</div>

				<h2>WebSocket Endpoint</h2>
				<p>All connections go to: <code>/ws</code></p>
				<p>Authentication via query param: <code>?token=user:username</code></p>

				<h2>Documentation</h2>
				<ul>
					<li><a href="https://github.com/v0id-user/verani">GitHub Repository</a></li>
					<li>Examples README: <code>examples/README.md</code></li>
					<li>API Documentation: <code>docs/api/server.md</code></li>
				</ul>

				<h2>Development</h2>
				<p>Make sure to run <code>wrangler dev</code> to start the server before running clients.</p>
				<p>Default development URL: <strong>http://localhost:8787</strong></p>
			</body>
			</html>"
		`);
	});

	it('responds with Hello World! (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(await response.text()).toMatchInlineSnapshot(`
			"<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Verani Examples</title>
				<style>
					body {
						font-family: system-ui, -apple-system, sans-serif;
						max-width: 800px;
						margin: 40px auto;
						padding: 0 20px;
						line-height: 1.6;
						color: #333;
					}
					h1 { color: #2563eb; }
					h2 { color: #1e40af; margin-top: 30px; }
					code {
						background: #f3f4f6;
						padding: 2px 6px;
						border-radius: 3px;
						font-family: 'Courier New', monospace;
					}
					pre {
						background: #1f2937;
						color: #f9fafb;
						padding: 15px;
						border-radius: 6px;
						overflow-x: auto;
					}
					pre code {
						background: none;
						color: inherit;
						padding: 0;
					}
					.example {
						background: #f9fafb;
						border-left: 4px solid #2563eb;
						padding: 15px;
						margin: 15px 0;
					}
					.config {
						background: #fef3c7;
						border-left: 4px solid #f59e0b;
						padding: 15px;
						margin: 15px 0;
					}
					a { color: #2563eb; text-decoration: none; }
					a:hover { text-decoration: underline; }
				</style>
			</head>
			<body>
				<h1>Verani Examples</h1>
				<p>Real-time SDK for Cloudflare Actors with Socket.io-like semantics and proper hibernation support.</p>

				<h2>Architecture</h2>
				<p>This example uses the <strong>per-connection architecture</strong> where each user gets their own ConnectionDO, with separate RoomDOs for coordination.</p>

				<div class="config">
					<h3>Current Configuration</h3>
					<ul>
						<li><strong>WebSocket Path:</strong> <code>/ws</code></li>
						<li><strong>Connection DO:</strong> <code>UserConnection</code></li>
						<li><strong>Presence Room DO:</strong> <code>PresenceRoom</code></li>
						<li><strong>Chat Room DO:</strong> <code>ChatRoom</code></li>
					</ul>
				</div>

				<h2>Running Examples</h2>
				<p>This worker provides WebSocket endpoints for the example rooms. To interact with them, use the TypeScript CLI clients.</p>

				<div class="example">
					<h3>Presence Tracking</h3>
					<pre><code>bun run examples/clients/presence-client.ts</code></pre>
					<p>Track who's online with multi-device support and status indicators.</p>
				</div>

				<div class="example">
					<h3>Chat Room</h3>
					<pre><code>bun run examples/clients/chat-client.ts</code></pre>
					<p>Real-time chat with typing indicators, online users, and message broadcasting.</p>
				</div>

				<h2>WebSocket Endpoint</h2>
				<p>All connections go to: <code>/ws</code></p>
				<p>Authentication via query param: <code>?token=user:username</code></p>

				<h2>Documentation</h2>
				<ul>
					<li><a href="https://github.com/v0id-user/verani">GitHub Repository</a></li>
					<li>Examples README: <code>examples/README.md</code></li>
					<li>API Documentation: <code>docs/api/server.md</code></li>
				</ul>

				<h2>Development</h2>
				<p>Make sure to run <code>wrangler dev</code> to start the server before running clients.</p>
				<p>Default development URL: <strong>http://localhost:8787</strong></p>
			</body>
			</html>"
		`);
	});
});
