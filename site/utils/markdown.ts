import { marked } from "marked";
import { docsBundle } from "../src/docs-data.js";

export interface DocFile {
	path: string;
	url: string;
	title: string;
	content: string;
	html: string;
}

export interface NavItem {
	title: string;
	url: string;
	children?: NavItem[];
}

/**
 * Read a markdown file and convert it to HTML
 */
export function renderMarkdown(content: string): string {
	return marked(content) as string;
}

/**
 * Capitalize section names (handles acronyms and kebab-case)
 */
function capitalizeSection(name: string): string {
	// Handle common acronyms and special cases
	const specialCases: Record<string, string> = {
		api: "API",
		rpc: "RPC",
		http: "HTTP",
		https: "HTTPS",
		websocket: "WebSocket",
		websockets: "WebSockets",
		url: "URL",
		uri: "URI",
		json: "JSON",
		xml: "XML",
		html: "HTML",
		css: "CSS",
		js: "JS",
		ts: "TS",
		dom: "DOM",
		ui: "UI",
		ux: "UX",
		cli: "CLI",
		sdk: "SDK",
		rest: "REST",
		graphql: "GraphQL",
		jwt: "JWT",
		oauth: "OAuth",
		cors: "CORS",
	};

	const lowerName = name.toLowerCase();
	if (specialCases[lowerName]) {
		return specialCases[lowerName];
	}

	// Capitalize first letter and handle kebab-case
	return name
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

/**
 * Get the title from markdown content (first h1 or filename)
 */
export function extractTitle(content: string, filePath: string): string {
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match && h1Match[1]) {
		return h1Match[1];
	}
	// Extract filename from path
	const parts = filePath.split("/");
	const filename = parts[parts.length - 1];
	if (!filename) {
		return "Untitled";
	}
	return capitalizeSection(filename.replace(/\.md$/, ""));
}

/**
 * Get navigation tree from bundled docs
 */
export function getNavigation(): NavItem[] {
	return [...docsBundle.navigation] as NavItem[];
}

/**
 * Load a doc file by URL path
 */
export function loadDoc(urlPath: string): DocFile | null {
	// Normalize URL path
	const normalizedPath = urlPath === "/" ? "/" : urlPath;

	// Type assertion to handle readonly bundle
	const files = docsBundle.files as unknown as Record<string, { path: string; url: string; content: string }>;
	const docData = files[normalizedPath];

	if (!docData) {
		return null;
	}

	const html = renderMarkdown(docData.content);
	const title = extractTitle(docData.content, docData.path);

	return {
		path: docData.path,
		url: docData.url,
		title,
		content: docData.content,
		html,
	};
}
