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
	});
