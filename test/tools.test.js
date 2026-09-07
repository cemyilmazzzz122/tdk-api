const assert = require("node:assert");
const { TDK, TDKClient } = require("../dist/index.js");

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
  assert.strictEqual(typeof client.checkLabialHarmony, "function");
  console.log("  ✓ TDKClient passed.");

  console.log("\n All linguistic tools & client tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
