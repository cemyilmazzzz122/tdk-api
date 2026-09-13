import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/mcp.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  shims: true,
  // Single source of truth for `tdk --version` and the MCP server version.
  define: { __PKG_VERSION__: JSON.stringify(version) },
});
