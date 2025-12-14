import { Elysia } from "elysia";
import { loadDoc } from "../utils/markdown.js";
import { getNavigationSync } from "../utils/navigation.js";
import { renderPage } from "../utils/template.js";

export const docsRoutes = new Elysia()
	.get("/", ({ set }) => {
		const doc = loadDoc("/");
		if (!doc) {
			set.status = 404;
			return "Documentation not found";
		}

		const navigation = getNavigationSync();
		const html = renderPage(doc.title, doc.html, navigation, doc.url);

		set.headers["content-type"] = "text/html";
		return html;
	})
	.get("/docs/*", ({ params, set }) => {
		const path = params["*"];
		const urlPath = `/docs/${path}`;

		const doc = loadDoc(urlPath);
		if (!doc) {
			set.status = 404;
			return "Documentation not found";
		}

		const navigation = getNavigationSync();
		const html = renderPage(doc.title, doc.html, navigation, doc.url);

		set.headers["content-type"] = "text/html";
		return html;
	});
