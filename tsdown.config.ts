import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    verani: "./src/verani.ts",
    client: "./src/client.ts",
    typed: "./src/typed/index.ts",
    "typed-client": "./src/typed/client-entry.ts",
    "typed-shared": "./src/typed/shared.ts",
  },
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  minify: {
		compress: {
			dropDebugger: true,
			dropConsole: true,
		},
	},
  sourcemap: false,
  platform: "node",
  treeshake: true,
  clean: true,
  external: [
    "@cloudflare/actors",
  ],
});
