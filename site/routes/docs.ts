import { Elysia } from "elysia";
import { loadDoc } from "../utils/markdown.js";
import { getNavigationSync } from "../utils/navigation.js";
import { renderPage } from "../utils/template.js";

export const docsRoutes = new Elysia()
	.get("/", ({ set }) => {
		const doc = loadDoc("/");
		if (!doc) {
			set.status = 404;
			return new Response("Documentation not found", {
				status: 404,
				headers: { "Content-Type": "text/plain" },
			});
		}

		const navigation = getNavigationSync();
		const html = renderPage(doc.title, doc.html, navigation, doc.url);

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
			},
		});
	})
	// Main docs route
	.get("/docs/*", ({ params, set }) => {
		let path = params["*"];

		// Support both `/docs/foo/bar` and `/docs/foo/bar.md`
		if (path.endsWith(".md")) {
			path = path.slice(0, -3);
		}

		const urlPath = `/docs/${path}`;

		const doc = loadDoc(urlPath);
		if (!doc) {
			set.status = 404;
			return new Response("Documentation not found", {
				status: 404,
				headers: { "Content-Type": "text/plain" },
			});
		}

		const navigation = getNavigationSync();
		const html = renderPage(doc.title, doc.html, navigation, doc.url);

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
			},
		});
	})
	// Support GitHub-style relative links from the root README:
	// e.g. `/getting-started/quick-start.md` -> `/docs/getting-started/quick-start`
	.get("/:section/*", ({ params, set }) => {
		const section = params.section as string;
		let rest = params["*"] as string;

		// Only handle known top-level sections to avoid catching assets like `/styles.css`
		const allowedSections = new Set([
			"getting-started",
			"api",
			"guides",
			"examples",
			"concepts",
			"security",
		]);

		if (!allowedSections.has(section)) {
			set.status = 404;
			return new Response("Documentation not found", {
				status: 404,
				headers: { "Content-Type": "text/plain" },
			});
		}

		// Strip `.md` if present
		if (rest.endsWith(".md")) {
			rest = rest.slice(0, -3);
		}

		const urlPath = `/docs/${section}/${rest}`;
		const doc = loadDoc(urlPath);

		if (!doc) {
			set.status = 404;
			return new Response("Documentation not found", {
				status: 404,
				headers: { "Content-Type": "text/plain" },
			});
		}

		const navigation = getNavigationSync();
		const html = renderPage(doc.title, doc.html, navigation, doc.url);

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
			},
		});
	});
