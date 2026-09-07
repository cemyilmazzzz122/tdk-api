const assert = require("node:assert");
const { TDK } = require("../dist/index.js");

async function runTests() {
  console.log("=== Running Grammar & Phonology Unit Tests ===");

  // 1. Büyük Ünlü Uyumu (Major Vowel Harmony)
  console.log("1. Testing checkVowelHarmony (Büyük Ünlü Uyumu)...");
  assert.strictEqual(TDK.checkVowelHarmony("adım"), true);
  assert.strictEqual(TDK.checkVowelHarmony("kapı"), true);
  assert.strictEqual(TDK.checkVowelHarmony("gözlük"), true);
  assert.strictEqual(TDK.checkVowelHarmony("otobüs"), false);
  assert.strictEqual(TDK.checkVowelHarmony("kalem"), false);
  assert.strictEqual(TDK.checkVowelHarmony("kitap"), false);
  assert.strictEqual(TDK.checkVowelHarmony("ev"), true);
  console.log("  ✓ checkVowelHarmony passed.");

  // 2. Küçük Ünlü Uyumu (Minor Vowel / Labial Harmony)
  console.log("2. Testing checkLabialHarmony (Küçük Ünlü Uyumu)...");
  assert.strictEqual(TDK.checkLabialHarmony("elma"), true);
  assert.strictEqual(TDK.checkLabialHarmony("kalem"), true);
  assert.strictEqual(TDK.checkLabialHarmony("odun"), true);
  assert.strictEqual(TDK.checkLabialHarmony("kömür"), true);
  assert.strictEqual(TDK.checkLabialHarmony("çocuk"), true);
  assert.strictEqual(TDK.checkLabialHarmony("armut"), false);
  assert.strictEqual(TDK.checkLabialHarmony("yağmur"), false);
  assert.strictEqual(TDK.checkLabialHarmony("tavuk"), false);
  assert.strictEqual(TDK.checkLabialHarmony("doktor"), false);
  assert.strictEqual(TDK.checkLabialHarmony("horoz"), false);
  assert.strictEqual(TDK.checkLabialHarmony("müzik"), false);
  assert.strictEqual(TDK.checkLabialHarmony("ev"), true);
  console.log("  ✓ checkLabialHarmony passed.");

  // 3. Heceleme (Syllabification)
  console.log("3. Testing syllabicate...");
  assert.deepStrictEqual(TDK.syllabicate("kalem"), ["ka", "lem"]);
  assert.deepStrictEqual(TDK.syllabicate("ilkokul"), ["il", "ko", "kul"]);
  assert.deepStrictEqual(TDK.syllabicate("muvaffakiyet"), ["mu", "vaf", "fa", "ki", "yet"]);
  assert.deepStrictEqual(TDK.syllabicate("elektrik"), ["e", "lek", "trik"]);
  assert.deepStrictEqual(TDK.syllabicate("kontrol"), ["kon", "trol"]);
  assert.deepStrictEqual(TDK.syllabicate("orkestra"), ["or", "kes", "tra"]);
  assert.deepStrictEqual(TDK.syllabicate("kral"), ["kral"]);
  assert.deepStrictEqual(TDK.syllabicate("tren"), ["tren"]);
  console.log("  ✓ syllabicate passed.");

  console.log("\n All grammar & phonology tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
