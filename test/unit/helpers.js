// Offline test helpers: a fake `fetch` that serves TDK-shaped responses, so unit
// tests exercise the real request/cache/scraping code without touching the network.

const HEADWORDS = [
  "kal",
  "kala",
  "kalem",
  "kalemlik",
  "kâğıt",
  "kâğıt ağacı",
  "kac",
  "kaç",
  "kaçak",
  "sal",
  "salam",
  "selam",
  "sus payı",
  "şal",
  "İstanbul",
  "agâh",
  "agami",
  "halı",
  "kitap",
  "kelam",
  "kemal",
  "emlak",
  "kilim",
  "bahar",
  "ilkbahar",
  "sonbahar",
  "buhar",
];

/** A JS bundle embedding `words` the way sozluk.gov.tr's frontend does. */
function bundleFor(words) {
  const literal = JSON.stringify(words.map((madde) => ({ madde })));
  return `const n=1;const Qe=JSON.parse(\`${literal}\`);export{Qe as h};`;
}

/** A minimal `/gts` entry. */
function entry(madde, extra = {}) {
  return [{ madde, lisan: "", anlamlarListe: [{ anlam: `${madde} anlamı` }], ...extra }];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** Routes sozluk.gov.tr URLs to fixture responses; anything else is a 404. */
function tdkRoutes({ words = HEADWORDS, entries = {}, onBundle } = {}) {
  return (url) => {
    if (url === "https://sozluk.gov.tr/") {
      return new Response('<script type="module" crossorigin src="/assets/index-Ab12Cd.js"></script>');
    }
    if (url.startsWith("https://sozluk.gov.tr/assets/index-")) {
      onBundle?.();
      return new Response(bundleFor(words));
    }
    if (url.startsWith("https://sozluk.gov.tr/gts?ara=")) {
      const word = decodeURIComponent(url.slice("https://sozluk.gov.tr/gts?ara=".length));
      return json(entries[word] ?? { error: "Sonuç bulunamadı" });
    }
    if (url === "https://sozluk.gov.tr/icerik") {
      return json({ kelime: [], atasoz: [], kural: [], syyd: [], karistirma: [] });
    }
    return new Response("not found", { status: 404 });
  };
}

/** Replaces `globalThis.fetch` with `handler(url, init)`; records requested URLs. */
function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    return handler(String(url), init);
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

/** A fetch that never answers but honours its abort signal (for timeout/abort tests). */
function hangingFetch() {
  return stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      })
  );
}

module.exports = { HEADWORDS, bundleFor, entry, json, tdkRoutes, stubFetch, hangingFetch };
