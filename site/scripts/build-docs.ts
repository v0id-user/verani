import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join, relative, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, "..", "..", "docs");
const OUTPUT_FILE = join(__dirname, "..", "src", "docs-data.ts");

// Section order for logical documentation flow
const SECTION_ORDER: Record<string, number> = {
	"getting-started": 1,
	"concepts": 2,
	"api": 3,
	"guides": 4,
	"examples": 5,
	"security": 6,
};

interface DocData {
	path: string;
	url: string;
	content: string;
}

interface DocsBundle {
	files: Record<string, DocData>;
	navigation: Array<{
		title: string;
		url: string;
		children?: Array<any>;
	}>;
}

/**
 * Get sort order for a section name
 */
function getSectionOrder(name: string, isRootLevel: boolean): number {
	if (!isRootLevel) {
		// For nested items, use alphabetical order (high number = sort later)
		return 999;
	}
	const order = SECTION_ORDER[name.toLowerCase()];
	return order !== undefined ? order : 999; // Unknown sections go to end
}

async function scanDocs(dir: string, basePath: string = ""): Promise<{
	files: DocData[];
	navigation: Array<any>;
}> {
	const files: DocData[] = [];
	const navItems: Array<any> = [];
	const entries = await readdir(dir, { withFileTypes: true });
	const isRootLevel = basePath === "";

	// Sort: directories first, then files
	// For root level, use custom order; otherwise alphabetical
	const sortedEntries = entries.sort((a, b) => {
		if (a.isDirectory() && !b.isDirectory()) return -1;
		if (!a.isDirectory() && b.isDirectory()) return 1;

		// If root level and both are directories, use custom order
		if (isRootLevel && a.isDirectory() && b.isDirectory()) {
			const orderA = getSectionOrder(a.name, true);
			const orderB = getSectionOrder(b.name, true);
			if (orderA !== orderB) {
				return orderA - orderB;
			}
		}

		// Fallback to alphabetical
		return a.name.localeCompare(b.name);
	});

	for (const entry of sortedEntries) {
		if (entry.isDirectory()) {
			const dirPath = join(dir, entry.name);
			const dirRelativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
			const { files: childFiles, navigation: childNav } = await scanDocs(dirPath, dirRelativePath);

			// Check for README.md in directory
			const readmePath = join(dirPath, "README.md");
			try {
				await stat(readmePath);
				const readmeContent = await readFile(readmePath, "utf-8");
				let title = extractTitle(readmeContent, readmePath);

				// If title matches directory name (case-insensitive), capitalize it
				if (title.toLowerCase() === entry.name.toLowerCase()) {
					title = capitalizeSection(entry.name);
				}

				const url = `/docs/${dirRelativePath}`;

				files.push({
					path: relative(DOCS_DIR, readmePath),
					url,
					content: readmeContent,
				});

				navItems.push({
					title,
					url,
					children: childNav.length > 0 ? childNav : undefined,
				});
			} catch {
				// No README, but still add directory if it has children
				if (childNav.length > 0) {
					const url = `/docs/${dirRelativePath}`;
					navItems.push({
						title: capitalizeSection(entry.name),
						url,
						children: childNav,
					});
				}
			}

			files.push(...childFiles);
		} else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
			const filePath = join(dir, entry.name);
			const fileRelativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
			const content = await readFile(filePath, "utf-8");
			const title = extractTitle(content, filePath);
			const url = `/docs/${fileRelativePath.replace(/\.md$/, "")}`;

			files.push({
				path: relative(DOCS_DIR, filePath),
				url,
				content,
			});

			navItems.push({
				title,
				url,
			});
		}
	}

	return { files, navigation: navItems };
}

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

function extractTitle(content: string, filePath: string): string {
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match) {
		const title = h1Match[1];
		if (title) {
			return title;
		}
	}
	const filename = basename(filePath, ".md");
	return capitalizeSection(filename);
}

async function build() {
	console.log("Building docs bundle...");
	console.log(`Reading docs from: ${DOCS_DIR}`);

	const { files, navigation } = await scanDocs(DOCS_DIR);

	// Handle root README.md
	const rootReadmePath = join(DOCS_DIR, "README.md");
	let rootNavItem: { title: string; url: string } | null = null;
	try {
		await stat(rootReadmePath);
		const rootContent = await readFile(rootReadmePath, "utf-8");
		const rootTitle = extractTitle(rootContent, rootReadmePath);

		files.unshift({
			path: "README.md",
			url: "/",
			content: rootContent,
		});

		rootNavItem = {
			title: rootTitle,
			url: "/",
		};
	} catch {
		// No root README
	}

	// Sort root-level navigation items by section order
	if (rootNavItem) {
		// Separate root item from other sections
		const rootIndex = navigation.findIndex((item) => item.url === "/");
		if (rootIndex >= 0) {
			navigation.splice(rootIndex, 1);
		}

		// Sort sections by order
		navigation.sort((a, b) => {
			// Extract section name from URL (e.g., "/docs/api" -> "api")
			const getSectionName = (url: string): string => {
				if (url === "/") return "";
				const match = url.match(/^\/docs\/([^/]+)/);
				return match && match[1] ? match[1] : "";
			};

			const sectionA = getSectionName(a.url);
			const sectionB = getSectionName(b.url);

			const orderA = getSectionOrder(sectionA, true);
			const orderB = getSectionOrder(sectionB, true);

			if (orderA !== orderB) {
				return orderA - orderB;
			}

			// Fallback to alphabetical
			return sectionA.localeCompare(sectionB);
		});

		// Add root item at the beginning
		navigation.unshift(rootNavItem);
	} else {
		// Sort sections even without root item
		navigation.sort((a, b) => {
			const getSectionName = (url: string): string => {
				if (url === "/") return "";
				const match = url.match(/^\/docs\/([^/]+)/);
				if (match && match[1]) {
					return match[1];
				}
				return "";
			};

			const sectionA = getSectionName(a.url);
			const sectionB = getSectionName(b.url);

			const orderA = getSectionOrder(sectionA, true);
			const orderB = getSectionOrder(sectionB, true);

			if (orderA !== orderB) {
				return orderA - orderB;
			}

			return sectionA.localeCompare(sectionB);
		});
	}

	// Create a map for easy lookup
	const filesMap: Record<string, DocData> = {};
	for (const file of files) {
		filesMap[file.url] = file;
	}

	const bundle: DocsBundle = {
		files: filesMap,
		navigation,
	};

	// Write the bundled data
	const output = `// This file is auto-generated by scripts/build-docs.ts
// Do not edit manually

export const docsBundle = ${JSON.stringify(bundle, null, 2)} as const;
`;

	// Ensure src directory exists
	const srcDir = dirname(OUTPUT_FILE);
	try {
		await stat(srcDir);
	} catch {
		// Directory doesn't exist, but writeFile will create it
	}

	await writeFile(OUTPUT_FILE, output, "utf-8");

	console.log(`✓ Built docs bundle: ${files.length} files`);
	console.log(`✓ Output: ${OUTPUT_FILE}`);
}

build().catch(console.error);
