const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TDK, TDKClient, TDKNetworkError, TDKParseError } = require("../../dist/index.js");
const { entry, json, tdkRoutes, stubFetch, hangingFetch } = require("./helpers");

test("TDKClient instances keep separate configuration and caches", async () => {
  const stub = stubFetch(tdkRoutes({ entries: { kalem: entry("kalem") } }));
  try {
    const cached = new TDKClient({ cache: true });
    const uncached = new TDKClient();
    await cached.getWord("kalem");
    await cached.getWord("kalem");
    await uncached.getWord("kalem");
    await uncached.getWord("kalem");
    await TDK.getWord("kalem");
    const lookups = stub.calls.filter((url) => url.endsWith("/gts?ara=kalem"));
    assert.strictEqual(lookups.length, 4, "only the caching client may skip the second request");
  } finally {
    stub.restore();
  }
});

test("strict mode applies only to the client that enabled it", async () => {
  const stub = stubFetch(() => {
    throw new Error("offline");
  });
  try {
    const strict = new TDKClient({ strict: true, retries: 0 });
    const lenient = new TDKClient({ retries: 0 });
    await assert.rejects(strict.getNisanyan("kalem"), TDKNetworkError);
    assert.strictEqual(await lenient.getNisanyan("kalem"), null);
  } finally {
    stub.restore();
  }
});

test("bounded word cache evicts the least recently used entry", async () => {
  const words = Array.from({ length: 11 }, (_, i) => `kelime${i}`);
  const stub = stubFetch(tdkRoutes({ entries: Object.fromEntries(words.map((w) => [w, entry(w)])) }));
  try {
    const client = new TDKClient({ cache: true, maxCacheSize: 10 });
    for (const word of words.slice(0, 10)) await client.getWord(word);
    await client.getWord("kelime0"); // cache hit refreshes recency
    await client.getWord("kelime10"); // full cache: evicts kelime1, not kelime0

    const before = stub.calls.length;
    await client.getWord("kelime0");
    assert.strictEqual(stub.calls.length, before, "recently read entry must stay cached");
    await client.getWord("kelime1");
    assert.strictEqual(stub.calls.length, before + 1, "least recently used entry must be evicted");
  } finally {
    stub.restore();
  }
});

test("5xx responses are retried", async () => {
  let attempts = 0;
  const stub = stubFetch(() => (++attempts === 1 ? new Response("down", { status: 503 }) : json(entry("kalem"))));
  try {
    const results = await new TDKClient({ retries: 1 }).getWord("kalem");
    assert.strictEqual(results[0].madde, "kalem");
    assert.strictEqual(attempts, 2);
  } finally {
    stub.restore();
  }
});

test("a request exceeding timeoutMs fails with TDKNetworkError", async () => {
  const stub = hangingFetch();
  try {
    await assert.rejects(new TDKClient({ timeoutMs: 100, retries: 0 }).getWord("kalem"), TDKNetworkError);
  } finally {
    stub.restore();
  }
});

test("aborting rejects with the abort reason, even for fail-silent methods", async () => {
  const stub = hangingFetch();
  try {
    const client = new TDKClient({ timeoutMs: 300, retries: 0 });
    client.clearCache();
    const controller = new AbortController();
    const pending = [
      client.getWord("kalem", { signal: controller.signal }),
      client.getNisanyan("kalem", { signal: controller.signal }),
      client.getSuggestions("kal", 5, { signal: controller.signal }),
    ];
    controller.abort();
    for (const promise of pending) await assert.rejects(promise, { name: "AbortError" });
    await assert.rejects(client.getWord("kalem", { signal: AbortSignal.abort() }), { name: "AbortError" });
  } finally {
    stub.restore();
  }
});

test("non-strict clients report swallowed failures; strict clients throw them", async () => {
  const stub = stubFetch((url) => {
    if (url === "https://sozluk.gov.tr/") return new Response("<html>no bundle here</html>");
    if (url.startsWith("https://www.nisanyansozluk.com/")) {
      return new Response('<meta name="description" content="Çağdaş Türkçenin Etimolojisi">');
    }
    return new Response("not found", { status: 404 });
  });
  try {
    const errors = [];
    const lenient = new TDKClient({ retries: 0, onError: (error) => errors.push(error) });
    lenient.clearCache();
    assert.deepStrictEqual(await lenient.getSuggestions("kal"), []);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0] instanceof TDKParseError);

    const strict = new TDKClient({ retries: 0, strict: true });
    strict.clearCache();
    await assert.rejects(strict.getSuggestions("kal"), TDKParseError);
    assert.strictEqual(await strict.getNisanyan("qzxq"), null, "not found is still null in strict mode");
  } finally {
    stub.restore();
  }
});

test("getWordsBatch dedupes words, keeps input order and caps concurrency", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const stub = stubFetch(async (url) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight--;
    const word = decodeURIComponent(url.split("ara=")[1]);
    return json(word === "yok" ? { error: "Sonuç bulunamadı" } : entry(word));
  });
  try {
    const words = ["a1", "A1", "b2", "c3", "d4", "e5", "f6", "yok", ""];
    const results = await new TDKClient({ concurrency: 2 }).getWordsBatch(words);
    assert.deepStrictEqual(
      results.map((r) => r[0]?.madde ?? null),
      ["a1", "a1", "b2", "c3", "d4", "e5", "f6", null, null]
    );
    assert.strictEqual(stub.calls.length, 7, "duplicates and empty words must not be requested");
    assert.ok(maxInFlight <= 2, `at most 2 requests in flight, saw ${maxInFlight}`);
  } finally {
    stub.restore();
  }
});

test("getOrigin reports the root's origin with fallbackStem", async () => {
  const stub = stubFetch(tdkRoutes({ entries: { kitap: entry("kitap", { lisan: "Arapça kitāb" }) } }));
  try {
    const client = new TDKClient();
    client.clearCache();
    assert.strictEqual(await client.getOrigin("kitaplarımız"), null);
    assert.strictEqual(await client.getOrigin("kitaplarımız", true), "Arapça kitāb");
  } finally {
    stub.restore();
  }
});

test("checkSpelling prefers a common word over an equally close rare headword", async () => {
  // "kalwm" is one row-adjacent slip from both; the rare one comes first in the list.
  const stub = stubFetch(tdkRoutes({ words: ["kalqm", "kalem"] }));
  try {
    const client = new TDKClient();
    client.clearCache();
    const result = await client.checkSpelling("kalwm");
    assert.strictEqual(result.isCorrect, false);
    assert.strictEqual(result.suggestion, "kalem");
  } finally {
    stub.restore();
  }
});

test("found word lookups are cached on disk; misses are not", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-unit-words-"));
  let stub = stubFetch(tdkRoutes({ entries: { kalem: entry("kalem") } }));
  try {
    const online = new TDKClient({ diskCache: true, diskCacheDir: dir });
    const fresh = await online.getWord("kalem");
    assert.deepStrictEqual(await online.getWord("qzxq"), []);
    stub.restore();

    stub = stubFetch(() => {
      throw new Error("offline");
    });
    const offline = new TDKClient({ diskCache: true, diskCacheDir: dir, retries: 0 });
    assert.deepStrictEqual(await offline.getWord(" KALEM "), fresh);
    await assert.rejects(offline.getWord("qzxq"), TDKNetworkError);

    fs.writeFileSync(path.join(dir, "unrelated.txt"), "keep me");
    await offline.clearDiskCache();
    assert.deepStrictEqual(fs.readdirSync(dir), ["unrelated.txt"]);
  } finally {
    stub.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
