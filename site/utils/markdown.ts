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
 * Get the title from markdown content (first h1 or filename)
 */
export function extractTitle(content: string, filePath: string): string {
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match) {
		return h1Match[1];
	}
	// Extract filename from path
	const parts = filePath.split("/");
	const filename = parts[parts.length - 1];
	return filename.replace(/\.md$/, "");
}

/**
 * Get navigation tree from bundled docs
 */
export function getNavigation(): NavItem[] {
	return docsBundle.navigation as NavItem[];
}

/**
 * Load a doc file by URL path
 */
export function loadDoc(urlPath: string): DocFile | null {
	// Normalize URL path
	const normalizedPath = urlPath === "/" ? "/" : urlPath;
	const docData = docsBundle.files[normalizedPath];

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
