const test = require("node:test");
const assert = require("node:assert");
const { VERSION, TDKClient, createMcpServer: deprecatedCreateMcpServer } = require("../../dist/index.js");
const { createMcpServer, runMcpServer } = require("../../dist/mcp.js");
const pkg = require("../../package.json");

test("VERSION comes from package.json", () => {
  assert.strictEqual(VERSION, pkg.version);
});

test("the tdk-api-wrapper/mcp subpath builds a server, optionally around a given client", () => {
  assert.strictEqual(typeof runMcpServer, "function");
  assert.strictEqual(typeof createMcpServer().connect, "function");
  assert.strictEqual(typeof createMcpServer({ client: new TDKClient({ strict: true }) }).connect, "function");
  assert.strictEqual(pkg.exports["./mcp"].require, "./dist/mcp.js");
});

test("the main entry still re-exports the MCP helpers for compatibility", () => {
  assert.strictEqual(typeof deprecatedCreateMcpServer().connect, "function");
});
