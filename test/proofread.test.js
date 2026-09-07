const assert = require("node:assert");
const { TDK } = require("../dist/index.js");

async function runTests() {
  console.log("=== Running Proofread Unit & Integration Tests ===");

  // 1. Question Particle 'mi/mı/mu/mü'
  console.log("1. Testing question particle detection...");
  const q1 = await TDK.proofread("Sen dün okula gittinmi?");
  assert.strictEqual(q1.isCorrect, false);
  assert.strictEqual(q1.issues.length, 1);
  assert.strictEqual(q1.issues[0].type, "question_particle");
  assert.strictEqual(q1.issues[0].suggestion, "gittin mi");
  console.log("  ✓ Question particle passed.");

  // 2. Conjunction 'da/de'
  console.log("2. Testing conjunction da/de detection...");
  const d1 = await TDK.proofread("Sen gitsende ben kalacağım.");
  assert.strictEqual(d1.isCorrect, false);
  assert.strictEqual(d1.issues.length, 1);
  assert.strictEqual(d1.issues[0].type, "conjunction_da");
  assert.strictEqual(d1.issues[0].suggestion, "gitsen de");

  // Normal locative 'evde' should NOT trigger issue
  const d2 = await TDK.proofread("Bugün evde oturdum.");
  assert.strictEqual(d2.isCorrect, true);
  assert.strictEqual(d2.issues.length, 0);
  console.log("  ✓ Conjunction da/de passed.");

  // 3. Conjunction 'ki'
  console.log("3. Testing conjunction ki detection...");
  const k1 = await TDK.proofread("Anladımki beni dinlemiyorsun.");
  assert.strictEqual(k1.isCorrect, false);
  assert.strictEqual(k1.issues.length, 1);
  assert.strictEqual(k1.issues[0].type, "conjunction_ki");
  assert.strictEqual(k1.issues[0].suggestion, "anladım ki");

  // SOMBAHÇEMİ exceptions like 'çünkü', 'oysaki' should NOT trigger issue
  const k2 = await TDK.proofread("Oysaki seni çok sevmiştim çünkü güzeldin.");
  assert.strictEqual(k2.isCorrect, true);
  assert.strictEqual(k2.issues.length, 0);
  console.log("  ✓ Conjunction ki passed.");

  // 4. Combined sentence
  console.log("4. Testing combined sentence proofread...");
  const combo = await TDK.proofread("Gördümki gelmedin, bilsende gelirdin ve yaptınmı?");
  assert.strictEqual(combo.isCorrect, false);
  assert.strictEqual(combo.issues.length, 3);
  assert.strictEqual(combo.issues.some((i) => i.type === "conjunction_ki"), true);
  assert.strictEqual(combo.issues.some((i) => i.type === "conjunction_da"), true);
  assert.strictEqual(combo.issues.some((i) => i.type === "question_particle"), true);
  console.log("  ✓ Combined proofread passed.");

  // 5. Şey detachment check (herşey, hersey, birşeyler -> her şey, bir şeyler)
  console.log("5. Testing -şey detachment...");
  const s1 = await TDK.proofread("burda herşey yolunda");
  assert.strictEqual(s1.isCorrect, false);
  assert.strictEqual(s1.issues.length, 2);
  assert.strictEqual(s1.issues[0].word, "burda");
  assert.strictEqual(s1.issues[0].suggestion, "burada");
  assert.strictEqual(s1.issues[1].word, "herşey");
  assert.strictEqual(s1.issues[1].suggestion, "her şey");

  const s2 = await TDK.proofread("hersey çok güzel");
  assert.strictEqual(s2.isCorrect, false);
  assert.strictEqual(s2.issues[0].word, "hersey");
  assert.strictEqual(s2.issues[0].suggestion, "her şey");
  console.log("  ✓ -şey detachment passed.");

  // 6. Erroneously separated compound phrases (hiç bir, bir çok, git gide)
  console.log("6. Testing compound phrases...");
  const p1 = await TDK.proofread("hiç bir şey bilmiyor");
  assert.strictEqual(p1.isCorrect, false);
  assert.strictEqual(p1.issues[0].word, "hiç bir");
  assert.strictEqual(p1.issues[0].suggestion, "hiçbir");

  const p2 = await TDK.proofread("yada gelme");
  assert.strictEqual(p2.isCorrect, false);
  assert.strictEqual(p2.issues[0].suggestion, "ya da");
  console.log("  ✓ Compound phrases passed.");

  console.log("\n All proofread tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
