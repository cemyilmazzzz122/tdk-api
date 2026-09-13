const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TDKClient } = require("../../dist/index.js");
const { tdkRoutes, stubFetch } = require("./helpers");

/** Runs `fn` with a fresh client over the fixture headword list. */
async function withHeadwords(fn, routeOptions) {
  const stub = stubFetch(tdkRoutes(routeOptions));
  const client = new TDKClient();
  client.clearCache();
  try {
    await fn(client, stub);
  } finally {
    stub.restore();
  }
}

test("instant suggestions stay empty until the headword list loads", () =>
  withHeadwords(async (client) => {
    assert.deepStrictEqual(client.getInstantSuggestions("ka"), []);
    assert.strictEqual(await client.preloadHeadwords(), true);
    assert.deepStrictEqual(client.getInstantSuggestions("kal", 2), ["kal", "kala"]);
  }));

test("suggestions follow Turkish alphabet order and match letters exactly", () =>
  withHeadwords(async (client) => {
    assert.deepStrictEqual(await client.getSuggestions("ka", 20), [
      "kac",
      "kaç",
      "kaçak",
      "kal",
      "kala",
      "kalem",
      "kalemlik",
    ]);
    assert.deepStrictEqual(await client.getSuggestions("s", 20), ["sal", "salam", "selam", "sonbahar", "sus payı"]);
    assert.deepStrictEqual(await client.getSuggestions("ş"), ["şal"]);
    assert.deepStrictEqual(await client.getSuggestions("ag"), ["agâh", "agami"], "â sorts with a");
    assert.deepStrictEqual(await client.getSuggestions("İST"), ["İstanbul"]);
    assert.deepStrictEqual(await client.getSuggestions("ist"), ["İstanbul"]);
  }));

test("foldDiacritics fills remaining slots with diacritic-insensitive matches", () =>
  withHeadwords(async (client) => {
    await client.preloadHeadwords();
    assert.deepStrictEqual(client.getInstantSuggestions("kagit"), []);
    assert.deepStrictEqual(client.getInstantSuggestions("kagit", 10, { foldDiacritics: true }), [
      "kâğıt",
      "kâğıt ağacı",
    ]);
    const folded = client.getInstantSuggestions("ka", 20, { foldDiacritics: true });
    assert.deepStrictEqual(folded.slice(0, 7), client.getInstantSuggestions("ka", 20), "exact matches come first");
    assert.deepStrictEqual(folded.slice(7), ["kâğıt", "kâğıt ağacı"]);
    assert.deepStrictEqual(client.getInstantSuggestions("kal", 3, { foldDiacritics: true }), ["kal", "kala", "kalem"]);
  }));

test("concurrent loads share a single download", async () => {
  let bundles = 0;
  await withHeadwords(
    async (client) => {
      const other = new TDKClient();
      const results = await Promise.all([
        client.getSuggestions("kal"),
        other.getSuggestions("sel"),
        client.isHeadword("kitap"),
      ]);
      assert.deepStrictEqual(results, [["kal", "kala", "kalem", "kalemlik"], ["selam"], true]);
      assert.strictEqual(bundles, 1);
    },
    { onBundle: () => bundles++ }
  );
});

test("clearCache during a load keeps that load from refilling the list", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const routes = tdkRoutes();
  const stub = stubFetch(async (url) => {
    if (url.includes("/assets/")) await gate;
    return routes(url);
  });
  try {
    const client = new TDKClient();
    client.clearCache();
    const loading = client.preloadHeadwords();
    client.clearCache();
    release();
    assert.strictEqual(await loading, false);
    assert.deepStrictEqual(client.getInstantSuggestions("kal"), []);
  } finally {
    stub.restore();
  }
});

test("headword disk cache: a fresh copy skips the network, a stale one is a reported fallback", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-unit-headwords-"));
  const file = path.join(dir, "headwords.json");
  let bundles = 0;
  let stub = stubFetch(tdkRoutes({ onBundle: () => bundles++ }));
  try {
    const client = new TDKClient({ diskCache: true, diskCacheDir: dir });
    client.clearCache();
    await client.preloadHeadwords();
    client.clearCache();
    await client.preloadHeadwords();
    assert.strictEqual(bundles, 1, "second load must come from disk");

    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...saved, savedAt: 0 }));
    stub.restore();
    stub = stubFetch(() => {
      throw new Error("offline");
    });

    const errors = [];
    const offline = new TDKClient({ diskCache: true, diskCacheDir: dir, retries: 0, onError: (e) => errors.push(e) });
    offline.clearCache();
    assert.deepStrictEqual(await offline.getSuggestions("kal", 2), ["kal", "kala"]);
    assert.strictEqual(errors.length, 1, "the failed refresh must still be reported");

    await offline.clearDiskCache();
    assert.ok(!fs.existsSync(file));
  } finally {
    stub.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pattern, anagram and rhyme search run over the headword list", () =>
  withHeadwords(async (client) => {
    assert.deepStrictEqual(await client.patternSearch("k_l_m"), ["kalem", "kelam", "kilim"]);
    assert.deepStrictEqual(await client.patternSearch("*bahar"), ["bahar", "ilkbahar", "sonbahar"]);
    assert.deepStrictEqual((await client.findAnagrams("kalem")).sort(), ["emlak", "kelam", "kemal"]);
    assert.deepStrictEqual(await client.findRhymes("bahar"), ["ilkbahar", "sonbahar", "buhar"]);
  }));
