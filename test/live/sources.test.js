// Live canary for every scraped/undocumented source. Runs with a strict client so a
// source that changed shape or stopped answering fails loudly instead of returning
// null/[]. Run with `npm run test:live` (also scheduled weekly in CI).
const assert = require("node:assert");
const { TDKClient } = require("../../dist/index.js");

const client = new TDKClient({ strict: true, retries: 2, timeoutMs: 20000 });

const checks = {
  "TDK headword bundle": async () => {
    assert.strictEqual(await client.preloadHeadwords(), true);
    assert.strictEqual((await client.getSuggestions("kal")).length, 10);
    assert.strictEqual(await client.isHeadword("kalem"), true);
  },
  "TDK /gts": async () => {
    assert.ok((await client.getMeanings("kalem")).length > 0);
  },
  "TDK gts-yeni (audio)": async () => {
    assert.match((await client.getAudioUrl("kalem")) ?? "", /^https:\/\/api\.sozluk\.gov\.tr\/ses\/.+\.wav$/);
  },
  "TDK /icerik": async () => {
    const daily = await client.getDailyContent(true);
    assert.ok(daily && Array.isArray(daily.kelime) && Array.isArray(daily.kural));
  },
  "tdk.gov.tr rule page": async () => {
    // getRule samples /icerik's randomly rotating rule, so a single call can miss the
    // named rule (~25% of the time) without anything being broken; a parse failure
    // would throw in strict mode instead of returning null.
    for (let attempt = 0; attempt < 4; attempt++) {
      const [rule] = await client.getKurallar(true);
      assert.ok(rule, "icerik returned no rule");
      const text = await client.getRule(rule.adi);
      if (text !== null) return assert.ok(text.length > 100, "rule text is suspiciously short");
    }
    assert.fail("getRule never drew the requested rule in 4 attempts");
  },
  "Kubbealtı Lugatı": async () => {
    assert.ok(((await client.getKubbealtiMeanings("kalem")) ?? []).length > 0);
  },
  "Nişanyan Sözlük": async () => {
    assert.ok(((await client.getNisanyan("kalem")) ?? "").length > 20);
  },
  Wiktionary: async () => {
    assert.ok(await client.getWiktionary("kalem"));
  },
};

(async () => {
  let failed = 0;
  for (const [name, check] of Object.entries(checks)) {
    try {
      await check();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed++;
      console.log(`  ✗ ${name}: ${error?.name}: ${error?.message}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} source check(s) failed.`);
    process.exit(1);
  }
  console.log("\n All live source checks passed successfully!");
})();
