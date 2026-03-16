import { HeadContent, Scripts, createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
		],
	}),
	component: RootLayout,
});

function RootLayout() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<style
					dangerouslySetInnerHTML={{
						__html: `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --surface: #141414;
  --border: #262626;
  --text: #e5e5e5;
  --text-muted: #737373;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --success: #22c55e;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100dvh;
}

#root { height: 100%; display: flex; flex-direction: column; }
`,
					}}
				/>
			</head>
			<body>
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
