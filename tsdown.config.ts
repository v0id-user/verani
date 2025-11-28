import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/verani.ts", "./src/client.ts"],
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
