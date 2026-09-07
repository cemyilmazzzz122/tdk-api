const assert = require("node:assert");
const { TDK, getStemCandidates, restoreConsonantSoftening, restoreVowelDrop, restoreInfinitive } = require("../dist/index.js");

async function runTests() {
  console.log("=== Running Morphology Unit & Integration Tests ===");

  // 1. Phonology helpers
  console.log("1. Testing phonology helper functions...");
  assert.deepStrictEqual(restoreConsonantSoftening("kitab"), ["kitap"]);
  assert.deepStrictEqual(restoreConsonantSoftening("çocuğ"), ["çocuk"]);
  assert.deepStrictEqual(restoreConsonantSoftening("ağac"), ["ağaç"]);
  assert.deepStrictEqual(restoreConsonantSoftening("kanad"), ["kanat"]);
  assert.deepStrictEqual(restoreConsonantSoftening("reng"), ["renk"]);
  assert.deepStrictEqual(restoreVowelDrop("akl"), ["akıl"]);
  assert.deepStrictEqual(restoreVowelDrop("şehr"), ["şehir"]);
  assert.deepStrictEqual(restoreVowelDrop("omz"), ["omuz"]);
  assert.deepStrictEqual(restoreInfinitive("oku"), ["okumak"]);
  assert.deepStrictEqual(restoreInfinitive("gel"), ["gelmek"]);
  console.log("  ✓ Phonology helpers passed.");

  // 2. Candidate generation
  console.log("2. Testing getStemCandidates...");
  const c1 = getStemCandidates("halılarımızın");
  assert(c1.includes("halı"), "halılarımızın must contain halı");

  const c2 = getStemCandidates("kitabımız");
  assert(c2.includes("kitap"), "kitabımız must contain kitap");

  const c3 = getStemCandidates("çocuğa");
  assert(c3.includes("çocuk"), "çocuğa must contain çocuk");

  const c4 = getStemCandidates("şehre");
  assert(c4.includes("şehir"), "şehre must contain şehir");

  const c5 = getStemCandidates("aklımızda");
  assert(c5.includes("akıl"), "aklımızda must contain akıl");

  const c6 = getStemCandidates("okuyoruz");
  assert(c6.includes("okumak"), "okuyoruz must contain okumak");

  const c7 = getStemCandidates("gideceğiz");
  assert(c7.includes("gitmek"), "gideceğiz must contain gitmek");

  const c8 = getStemCandidates("İstanbul'da");
  assert(c8.includes("istanbul"), "İstanbul'da must contain istanbul");
  console.log("  ✓ Candidate generation passed.");

  // 3. TDK.isHeadword
  console.log("3. Testing TDK.isHeadword...");
  assert.strictEqual(await TDK.isHeadword("halı"), true);
  assert.strictEqual(await TDK.isHeadword("kitap"), true);
  assert.strictEqual(await TDK.isHeadword("okumak"), true);
  assert.strictEqual(await TDK.isHeadword("gelmek"), true);
  assert.strictEqual(await TDK.isHeadword("asdfqwertyzzz"), false);
  console.log("  ✓ TDK.isHeadword passed.");

  // 4. TDK.findRoot
  console.log("4. Testing TDK.findRoot...");
  assert.strictEqual(await TDK.findRoot("halılarımızın"), "halı");
  assert.strictEqual(await TDK.findRoot("kitabımız"), "kitap");
  assert.strictEqual(await TDK.findRoot("okuyoruz"), "okumak");
  assert.strictEqual(await TDK.findRoot("çocukların"), "çocuk");
  assert.strictEqual(await TDK.findRoot("kitap"), "kitap");
  console.log("  ✓ TDK.findRoot passed.");

  // 5. TDK.stem
  console.log("5. Testing TDK.stem...");
  const stem1 = await TDK.stem("halılarımızın");
  assert(stem1 !== null);
  assert.strictEqual(stem1.root, "halı");
  assert.strictEqual(stem1.isInflected, true);

  const stem2 = await TDK.stem("kitap");
  assert(stem2 !== null);
  assert.strictEqual(stem2.root, "kitap");
  assert.strictEqual(stem2.isInflected, false);
  console.log("  ✓ TDK.stem passed.");

  // 6. TDK.checkSpelling with morphology fallback
  console.log("6. Testing TDK.checkSpelling with morphology fallback...");
  const sp1 = await TDK.checkSpelling("halılarımızın");
  assert.strictEqual(sp1.isCorrect, true);
  assert.strictEqual(sp1.isInflected, true);
  assert.strictEqual(sp1.root, "halı");

  const sp2 = await TDK.checkSpelling("kitabımız");
  assert.strictEqual(sp2.isCorrect, true);
  assert.strictEqual(sp2.isInflected, true);
  assert.strictEqual(sp2.root, "kitap");

  const sp3 = await TDK.checkSpelling("yanlız");
  assert.strictEqual(sp3.isCorrect, false);
  assert.strictEqual(sp3.suggestion, "yalnız");

  const sp4 = await TDK.checkSpelling("asdfxyz12345");
  assert.strictEqual(sp4.isCorrect, false);
  console.log("  ✓ TDK.checkSpelling passed.");

  console.log("\n All morphology tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
