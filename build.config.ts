import { defineConfig } from "tsdown";
import { fixImportsPlugin } from 'esbuild-fix-imports-plugin'

export default defineConfig({
  entry: ["./src/verani.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  minify: false,
  sourcemap: false,
  platform: "node",
  treeshake: true,
  clean: true,
  external: [
    "@cloudflare/actors",
  ],
  plugins: [fixImportsPlugin()],
});
