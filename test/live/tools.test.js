const assert = require("node:assert");
const { TDK, TDKClient, createMcpServer, runMcpServer } = require("../../dist/index.js");

async function runTests() {
  console.log("=== Running Linguistic Tools & Client Tests ===");

  // 1. Pattern / Wildcard Search
  console.log("1. Testing patternSearch...");
  const p1 = await TDK.patternSearch("k_l_m");
  assert(p1.includes("kalem"), "k_l_m must contain kalem");
  assert(p1.includes("kilim"), "k_l_m must contain kilim");

  const p2 = await TDK.patternSearch("*istan");
  assert(p2.some((w) => w.toLowerCase().endsWith("istan")), "*istan must match words ending with istan");
  console.log("  ✓ patternSearch passed.");

  // 2. Anagram Solver
  console.log("2. Testing findAnagrams...");
  const a1 = await TDK.findAnagrams("kalem");
  assert(a1.includes("kelam"), "Anagrams of kalem must contain kelam");
  assert(a1.includes("kemal"), "Anagrams of kalem must contain kemal");
  console.log("  ✓ findAnagrams passed.");

  // 3. Rhyme Finder
  console.log("3. Testing findRhymes...");
  const r1 = await TDK.findRhymes("bahar");
  assert(r1.includes("sonbahar") || r1.includes("ilkbahar") || r1.includes("buhar"));
  console.log("  ✓ findRhymes passed.");

  // 3b. Instant autocomplete & headword disk cache
  console.log("3b. Testing getSuggestions / getInstantSuggestions / disk cache...");
  const s1 = await TDK.getSuggestions("Kal");
  assert.strictEqual(s1.length, 10, "getSuggestions defaults to 10 results");
  assert(s1.every((w) => w.toLocaleLowerCase("tr-TR").startsWith("kal")), "suggestions must match prefix case-insensitively");
  assert.deepStrictEqual(TDK.getInstantSuggestions("kal"), s1, "instant suggestions must match async ones");
  assert.strictEqual(TDK.getInstantSuggestions("kal", 3).length, 3, "limit must be respected");

  // Turkish alphabet order: 'kaç...' sorts after 'kac...' and before 'kad...'
  const kac = TDK.getInstantSuggestions("kaç", 5);
  assert(kac.length > 0 && kac.every((w) => w.startsWith("kaç")), "must find headwords starting with kaç");
  const s2 = await TDK.getSuggestions("ş", 50);
  assert(s2.length === 50 && s2.every((w) => w.toLocaleLowerCase("tr-TR").startsWith("ş")), "ş prefix must not match s");
  assert.deepStrictEqual(TDK.getInstantSuggestions("İstanbul"), TDK.getInstantSuggestions("istanbul"), "dotted İ must lowercase to i");

  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-headwords-"));
  TDK.configure({ diskCache: true, diskCacheDir: cacheDir });
  TDK.clearCache();
  assert.deepStrictEqual(TDK.getInstantSuggestions("kal"), [], "instant suggestions are empty before loading");
  const [loadA, loadB] = await Promise.all([TDK.preloadHeadwords(), TDK.preloadHeadwords()]);
  assert(loadA && loadB, "concurrent preloads must both succeed");
  assert(fs.existsSync(path.join(cacheDir, "headwords.json")), "headword list must be written to disk");

  TDK.clearCache();
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network disabled"));
  try {
    assert.deepStrictEqual(await TDK.getSuggestions("kal"), s1, "disk tier must serve suggestions without network");
  } finally {
    globalThis.fetch = realFetch;
  }
  await TDK.clearDiskCache();
  assert(!fs.existsSync(path.join(cacheDir, "headwords.json")), "clearDiskCache must remove the file");
  TDK.configure({ diskCache: false });
  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.log("  ✓ instant autocomplete passed.");

  // 4. Configuration & TDKClient
  console.log("4. Testing TDK.configure and TDKClient...");
  TDK.configure({ timeoutMs: 10000, retries: 2, maxCacheSize: 500 });

  const client = new TDKClient({ timeoutMs: 5000, cache: true });
  assert.strictEqual(typeof client.getWord, "function");
  assert.strictEqual(typeof client.checkSpelling, "function");
  assert.strictEqual(typeof client.findRoot, "function");
  assert.strictEqual(typeof client.proofread, "function");
  assert.strictEqual(typeof client.patternSearch, "function");
  assert.strictEqual(typeof client.findAnagrams, "function");
  assert.strictEqual(typeof client.findRhymes, "function");
  assert.strictEqual(typeof client.getInstantSuggestions, "function");
  assert.strictEqual(typeof client.preloadHeadwords, "function");
  assert.strictEqual(typeof client.checkLabialHarmony, "function");
  console.log("  ✓ TDKClient passed.");

  // 5. MCP server wiring
  console.log("5. Testing MCP server...");
  assert.strictEqual(typeof createMcpServer, "function");
  assert.strictEqual(typeof runMcpServer, "function");
  const mcp = createMcpServer();
  assert.ok(mcp && typeof mcp.connect === "function", "createMcpServer must return an McpServer");
  console.log("  ✓ MCP server passed.");

  console.log("\n All linguistic tools & client tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
