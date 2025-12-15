import type { NavItem } from "./markdown.js";

/**
 * Render navigation items to HTML
 */
export function renderNavItems(items: NavItem[], currentUrl: string, indent: number = 0): string {
	let html = "";
	const indentStr = "  ".repeat(indent);

	for (const item of items) {
		const isActive = item.url === currentUrl;
		const activeClass = isActive ? ' class="active"' : "";

		if (item.children && item.children.length > 0) {
			html += `${indentStr}<li${activeClass}>\n`;
			html += `${indentStr}  <a href="${item.url}">${escapeHtml(item.title)}</a>\n`;
			html += `${indentStr}  <ul class="nav-sublist">\n`;
			html += renderNavItems(item.children, currentUrl, indent + 2);
			html += `${indentStr}  </ul>\n`;
			html += `${indentStr}</li>\n`;
		} else {
			html += `${indentStr}<li${activeClass}><a href="${item.url}">${escapeHtml(item.title)}</a></li>\n`;
		}
	}

	return html;
}

/**
 * Render the full page template
 */
export function renderPage(title: string, content: string, navigation: NavItem[], currentUrl: string): string {
	const navHtml = renderNavItems(navigation, currentUrl);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(title)} - Verani Docs</title>
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<div class="container">
		<nav class="sidebar">
			<div class="nav-header">
				<h1>Verani</h1>
			</div>
			<ul class="nav-list">
${navHtml}			</ul>
		</nav>
		<main class="content">
			<article class="doc-content">
				${content}
			</article>
		</main>
	</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
