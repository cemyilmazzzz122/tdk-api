import type {
  WordInfo,
  DailyContent,
  SpellCheckResult,
  WordOfTheDay,
  DailyPick,
  WordComparison,
  WordAnalysis,
  TDKRule,
  KubbealtiEntry,
  WiktionaryEntry,
} from "./types";
import { TDKValidationError, TDKNetworkError } from "./errors";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import * as tls from "node:tls";

/**
 * TDK (Türk Dil Kurumu) API Wrapper
 */
export class TDK {
  private static readonly BASE_URL = "https://sozluk.gov.tr";
  private static readonly AUDIO_API_HOST = "api.sozluk.gov.tr";
  private static readonly KUBBEALTI_HOST = "eski.lugatim.com";

  /**
   * `eski.lugatim.com` (Kubbealtı Lugatı's data API) sends only its leaf
   * certificate during the TLS handshake, omitting the intermediates a
   * correctly configured server would include — a server-side misconfiguration,
   * not something we should paper over by disabling verification. These are
   * the two certificates the server *should* be sending (fetched from the
   * leaf's own Authority Information Access URLs), supplied here so Node can
   * still build a full, properly verified chain up to a root it already
   * trusts (ISRG Root X1). If Let's Encrypt rotates this intermediate, this
   * stops working and every Kubbealtı call fails closed to `null` — same
   * fail-closed contract as the rest of this file's fragile integrations.
   */
  private static readonly KUBBEALTI_EXTRA_CA = [
    `-----BEGIN CERTIFICATE-----
MIIE2jCCAsKgAwIBAgIQTr0klH4k05SALYSlL9WzGTANBgkqhkiG9w0BAQsFADAu
MQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjAe
Fw0yNTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYw
FAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZUjIwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQDZ0LxwBppqh84luqMerV/eeL/fXQ7mLQQv1Lnp
WKZbyvGpx6wh6AfnslAnF6ewTkcHA+gSOoBvm3Dfm06AuGiF+KRut4fAcowqnAQQ
CW98+QPP/eOv/wug7Iyk4NkOxf2I6g2f55T6nJoOTLFcukeRq80JGQEYan+dPFr9
OGUgQK2hGKgNkW87pappsOAuUJcroYhRt5uUis4qaZireiseu32gzDJNBAiKtsvd
6HX4v25bpkRNcS/B/Gtc9kVbUpD+2PLPxdei3Tim55k4tfAEXwD2qyiPTxrTNq6l
N+AMr5g2c1dNqkOTwjxeV6L5lpP1rGiYvLnRaPlOqyZRPW+5AgMBAAGjge4wgesw
DgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUFBwMBMBIGA1UdEwEB/wQI
MAYBAf8CAQAwHQYDVR0OBBYEFEAVLSZ57TIgnt+ach3WMh+BDIEMMB8GA1UdIwQY
MBaAFN7nW2DQIm1AKH0/DQH+pLVStFGUMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEF
BQcwAoYWaHR0cDovL3lyLmkubGVuY3Iub3JnLzATBgNVHSAEDDAKMAgGBmeBDAEC
ATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veXIuYy5sZW5jci5vcmcvMA0GCSqG
SIb3DQEBCwUAA4ICAQB0ZUQWZ9/Yn9COEpo+JfecMnB0h0vwDm/M66IqXqw3LoaL
mx9lZvRTeDIS67PUeI3yCA2W6PKRD0/FE/G57lOmS+Xy5AaaL00ICGOqjNcCaMWW
8o8nevHOd4i4lqgtznE/28QwlcdJyF8yBiWHpnyjhEpmNWJURgOCOg2xpwRMBCsj
MScqYPtOhBeuYQvSwAEeTML2Ukh6uGuX4E14q65Ja8cdjF5bAldnP1eE4FBaAwsZ
G2fOqqrKV03Y85Nw2btedP1AtliQuJZs/Jo/gXxXdc7LrH3McgnpnbTiAncX7yES
hP6kzQejllqMCIt52HOjxDGWafS7Xw+DKwqmH+Eqy8dcbOuag/1AYlQoKNVK3F5q
Hh6tEDiMqQcLIibGKteE6iHo4A/bIScbzrhXUYuism42ZYzmc48FMVIH3qy4L84E
TdAH2gtxw0PAhvRVXp8HP7wfngpzsN/8xOTpeRSbM4+Qbc56G6+Bifmv6sk1ieQb
NA3wJdl4DDUuQSV8hBgx6zoI1ZSGORprDFux7c6rhc77QZMSRrEgomBeklervEve
86ylWmZ3WWHV6RLMi8xNvjd71r4EPIGgY7BZU/VPBkq+uA7Gb6mbJnFgV43uh3xy
LRFgxIAphIukwTGSMZZR+AI+Qnp0BYTWovHXozOf3H8r6hozEoT02JHn0AeTfA==
-----END CERTIFICATE-----`,
    `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`,
  ];

  // Cache Mechanism
  private static isCacheEnabled = false;
  private static wordCache = new Map<string, WordInfo[]>();
  private static dailyContentCache: DailyContent | null = null;
  private static autocompleteCache: string[] = [];

  /**
   * Enables or disables in-memory caching for API requests.
   */
  public static enableCache(status = true): void {
    this.isCacheEnabled = status;
    if (!status) {
      this.clearCache();
    }
  }

  /**
   * Clears the internal cache.
   */
  public static clearCache(): void {
    this.wordCache.clear();
    this.dailyContentCache = null;
    this.autocompleteCache = [];
  }

  private static delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetches detailed information for a given word from the TDK Dictionary.
   */
  public static async getWord(word: string): Promise<WordInfo[]> {
    if (!word || word.trim() === "") {
      throw new TDKValidationError("Word parameter cannot be empty.");
    }

    const cleanWord = word.trim().toLocaleLowerCase("tr-TR");

    if (this.isCacheEnabled && this.wordCache.has(cleanWord)) {
      return this.wordCache.get(cleanWord)!;
    }

    const url = `${this.BASE_URL}/gts?ara=${encodeURIComponent(cleanWord)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
      });
    } catch (error) {
      throw new TDKNetworkError("Failed to fetch word from TDK: request failed.", { cause: error });
    }

    if (!response.ok) {
      throw new TDKNetworkError(`Failed to fetch word from TDK: HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new TDKNetworkError("Failed to fetch word from TDK: invalid JSON response.", { cause: error });
    }

    if (!Array.isArray(data) && data && "error" in (data as Record<string, unknown>)) {
      if (this.isCacheEnabled) this.wordCache.set(cleanWord, []);
      return [];
    }

    const results = data as WordInfo[];
    if (this.isCacheEnabled) {
      this.wordCache.set(cleanWord, results);
    }
    return results;
  }

  /**
   * Helper method to get only the meanings (definitions) of a word as a string array.
   */
  public static async getMeanings(word: string): Promise<string[]> {
    const results = await this.getWord(word);
    if (results.length === 0) return [];
    
    const meanings: string[] = [];
    for (const result of results) {
      if (result.anlamlarListe) {
        for (const anlam of result.anlamlarListe) {
          if (anlam.anlam) meanings.push(anlam.anlam);
        }
      }
    }
    return meanings;
  }

  /**
   * `sozluk.gov.tr`'s dedicated `/autocomplete.json` (and `/data/autocomplete.json`)
   * routes no longer serve JSON — they fall through to the SPA's `index.html`.
   * The full ~81k-word headword list the site's own autocomplete UI uses is
   * instead bundled directly into its main JS asset as a
   * `JSON.parse(\`[{"madde":"..."}]\`)` literal, so this fetches the home
   * page to find that asset's current hashed filename, downloads it (a few
   * MB, only once per process), and extracts the literal out of it. Fragile
   * scraping of an implementation detail — if TDK's build stops embedding
   * this, this fails closed to `[]` rather than throwing.
   */
  private static async fetchAutocompleteData(): Promise<string[]> {
    try {
      const homeResponse = await fetch(`${this.BASE_URL}/`, {
        headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
      });
      if (!homeResponse.ok) return [];
      const html = await homeResponse.text();

      const scriptMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
      if (!scriptMatch) return [];

      const bundleResponse = await fetch(`${this.BASE_URL}${scriptMatch[1]}`, {
        headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
      });
      if (!bundleResponse.ok) return [];
      const bundleJs = await bundleResponse.text();

      const startMarker = 'JSON.parse(`[{"madde":';
      const startIdx = bundleJs.indexOf(startMarker);
      if (startIdx === -1) return [];
      const jsonStart = startIdx + "JSON.parse(".length + 1;
      const jsonEnd = bundleJs.indexOf("`)", jsonStart);
      if (jsonEnd === -1) return [];

      const data = JSON.parse(bundleJs.slice(jsonStart, jsonEnd)) as { madde: string }[];
      return data.map((item) => item.madde).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Returns autocomplete suggestions for a given prefix, searched over TDK's
   * full headword list (see `fetchAutocompleteData`). The list is fetched
   * and cached once per process regardless of `enableCache()` — the same
   * caching behavior as before — and only cleared by `clearCache()`.
   */
  public static async getSuggestions(prefix: string): Promise<string[]> {
    if (!prefix || prefix.trim() === "") return [];

    if (this.autocompleteCache.length === 0) {
      this.autocompleteCache = await this.fetchAutocompleteData();
    }

    const cleanPrefix = prefix.trim().toLocaleLowerCase("tr-TR");
    return this.autocompleteCache
      .filter(w => w.toLocaleLowerCase("tr-TR").startsWith(cleanPrefix))
      .slice(0, 10);
  }

  /**
   * Returns a list of proverbs and idioms containing the word.
   */
  public static async getProverbs(word: string): Promise<string[]> {
    const results = await this.getWord(word);
    if (results.length === 0) return [];
    
    const proverbs: string[] = [];
    for (const result of results) {
      if (result.atasozu) {
        for (const atasoz of result.atasozu) {
          if (atasoz.madde) proverbs.push(atasoz.madde);
        }
      }
    }
    return proverbs;
  }

  /**
   * Returns the etymological origin of the word, or "Türkçe" if TDK doesn't
   * record a foreign origin for it. Returns `null` only when the word itself
   * isn't found in the dictionary at all.
   */
  public static async getOrigin(word: string): Promise<string | null> {
    const results = await this.getWord(word);
    if (results.length === 0) return null;
    return results[0].lisan || "Türkçe";
  }

  /**
   * Returns whether the word has a recorded foreign etymological origin.
   * Returns `null` (instead of a boolean) when the word isn't found at all.
   */
  public static async isForeignWord(word: string): Promise<boolean | null> {
    const origin = await this.getOrigin(word);
    if (origin === null) return null;
    return origin !== "Türkçe";
  }

  /**
   * Groups a list of words by their etymological origin. Words not found in
   * the dictionary are grouped under "Bilinmiyor". Throttled like getWordsBatch.
   */
  public static async groupByOrigin(words: string[]): Promise<Record<string, string[]>> {
    const groups: Record<string, string[]> = {};
    for (const word of words) {
      const origin = (await this.getOrigin(word)) ?? "Bilinmiyor";
      if (!groups[origin]) groups[origin] = [];
      groups[origin].push(word);
      await this.delay(200);
    }
    return groups;
  }

  /**
   * Returns literature examples containing the word.
   */
  public static async getExamples(word: string): Promise<{ sentence: string; author: string | null }[]> {
    const results = await this.getWord(word);
    const examples: { sentence: string; author: string | null }[] = [];
    
    for (const result of results) {
      if (result.anlamlarListe) {
        for (const anlam of result.anlamlarListe) {
          if (anlam.orneklerListe) {
            for (const ornek of anlam.orneklerListe) {
              const author = ornek.yazar && ornek.yazar.length > 0 ? ornek.yazar[0].tam_adi : null;
              examples.push({ sentence: ornek.ornek, author });
            }
          }
        }
      }
    }
    return examples;
  }

  /**
   * Calls the `api.sozluk.gov.tr/gts-yeni` endpoint the official web UI uses
   * internally (richer than the public `/gts`: includes `seskod`,
   * `anlamEsAnlam`/`anlamKarsitAnlam`, etc). That endpoint 403s unless the
   * request looks like it came from a browser tab on sozluk.gov.tr: it needs
   * an `Origin`/`Referer` pair matching that site AND a browser-like
   * `User-Agent` (our usual `TDK-API-Nodejs-Wrapper/…` UA gets rejected).
   * `fetch` (undici) also strips a manually-set `Origin` header as a
   * forbidden header name, so this uses `node:https` directly instead.
   * This is inherently fragile scraping of an undocumented endpoint — if
   * TDK tightens this check further, this should fail closed to `null`
   * rather than throw.
   */
  private static fetchGtsYeni(word: string): Promise<any[] | null> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: this.AUDIO_API_HOST,
          path: `/gts-yeni?ara=${encodeURIComponent(word)}`,
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Origin: this.BASE_URL,
            Referer: `${this.BASE_URL}/`,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              resolve(Array.isArray(data) ? data : null);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.end();
    });
  }

  private static async fetchSeskod(word: string): Promise<string | null> {
    const data = await this.fetchGtsYeni(word);
    const seskod = data?.[0]?.seskod;
    return seskod ? String(seskod) : null;
  }

  /**
   * Returns synonyms ("eş anlamlı kelimeler") recorded for the word, pooled
   * across all of its meanings. Uses the same undocumented `gts-yeni`
   * endpoint as `getAudioUrl` — returns `[]` if the lookup fails.
   */
  public static async getSynonyms(word: string): Promise<string[]> {
    if (!word || word.trim() === "") return [];
    const data = await this.fetchGtsYeni(word.trim().toLocaleLowerCase("tr-TR"));
    if (!data) return [];

    const synonyms: string[] = [];
    for (const entry of data) {
      for (const anlam of entry.anlamlarListe ?? []) {
        for (const es of anlam.anlamEsAnlam ?? []) {
          if (es.deger) synonyms.push(es.deger);
        }
      }
    }
    return [...new Set(synonyms)];
  }

  /**
   * Returns antonyms ("zıt anlamlı kelimeler") recorded for the word, pooled
   * across all of its meanings. Uses the same undocumented `gts-yeni`
   * endpoint as `getAudioUrl` — returns `[]` if the lookup fails.
   */
  public static async getAntonyms(word: string): Promise<string[]> {
    if (!word || word.trim() === "") return [];
    const data = await this.fetchGtsYeni(word.trim().toLocaleLowerCase("tr-TR"));
    if (!data) return [];

    const antonyms: string[] = [];
    for (const entry of data) {
      for (const anlam of entry.anlamlarListe ?? []) {
        for (const ka of anlam.anlamKarsitAnlam ?? []) {
          if (ka.deger) antonyms.push(ka.deger);
        }
      }
    }
    return [...new Set(antonyms)];
  }

  /**
   * Returns the direct URL of the audio pronunciation, if TDK has one recorded for this word.
   */
  public static async getAudioUrl(word: string): Promise<string | null> {
    if (!word || word.trim() === "") {
      throw new TDKValidationError("Word parameter cannot be empty.");
    }

    const seskod = await this.fetchSeskod(word.trim().toLocaleLowerCase("tr-TR"));
    if (!seskod) return null;
    return `https://${this.AUDIO_API_HOST}/ses/${encodeURIComponent(seskod)}.wav`;
  }

  /**
   * Downloads the audio pronunciation to the specified path.
   */
  public static async downloadAudio(word: string, destPath?: string): Promise<string | null> {
    const url = await this.getAudioUrl(word);
    if (!url) return null;
    
    const finalPath = destPath || path.join(os.tmpdir(), `${word}.wav`);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      fs.writeFileSync(finalPath, Buffer.from(buffer));
      return finalPath;
    } catch {
      return null;
    }
  }

  /**
   * Checks spelling and returns suggestions if wrong.
   */
  public static async checkSpelling(word: string): Promise<SpellCheckResult> {
    // 1. Check if word exists
    const results = await this.getWord(word);
    if (results.length > 0) {
      return { isCorrect: true, word };
    }

    // 2. If not, check "sıkça yapılan yanlışlar" from DailyContent — an exact
    // match here is TDK explicitly saying "X is often confused with Y", so
    // it's authoritative when it hits (but only 2-3 rotating entries per call).
    const daily = await this.getDailyContent();
    if (daily) {
      const syydMatch = daily.syyd.find(s => s.yanliskelime.toLocaleLowerCase("tr-TR") === word.toLocaleLowerCase("tr-TR"));
      if (syydMatch) {
        return { isCorrect: false, word, suggestion: syydMatch.dogrukelime };
      }
      const mixMatch = daily.karistirma.find(s => s.yanlis.toLocaleLowerCase("tr-TR") === word.toLocaleLowerCase("tr-TR"));
      if (mixMatch) {
        return { isCorrect: false, word, suggestion: mixMatch.dogru };
      }
    }

    // 3. No exact match in TDK's curated lists: fall back to the closest
    // headword (by edit distance) across TDK's full ~81k-word list (the same
    // data `getSuggestions()` uses). Restricted to single-token, lowercase
    // headwords so it doesn't suggest compounds/phrases or proper nouns.
    // Candidates whose length differs too much are skipped before running
    // the O(n*m) distance calculation, both for speed and because a huge
    // length gap can't be within the distance threshold anyway. Ties (same
    // distance) prefer a matching first letter, then a matching length —
    // typos rarely change the first letter, and this avoids picking
    // whatever happens to sort alphabetically first. There's no word
    // frequency data available, so a genuine tie can still land on a
    // technically-correct but less commonly intended word.
    if (this.autocompleteCache.length === 0) {
      this.autocompleteCache = await this.fetchAutocompleteData();
    }
    const cleanWord = word.trim().toLocaleLowerCase("tr-TR");
    let best: { candidate: string; distance: number; firstMismatch: number; lengthMismatch: number } | null = null;
    for (const candidate of this.autocompleteCache) {
      if (candidate.includes(" ") || candidate !== candidate.toLocaleLowerCase("tr-TR")) continue;
      if (Math.abs(candidate.length - cleanWord.length) > 2) continue;

      const distance = this.damerauLevenshtein(cleanWord, candidate);
      if (distance === 0) continue;

      const firstMismatch = candidate[0] === cleanWord[0] ? 0 : 1;
      const lengthMismatch = candidate.length === cleanWord.length ? 0 : 1;
      const better =
        !best ||
        distance < best.distance ||
        (distance === best.distance && firstMismatch < best.firstMismatch) ||
        (distance === best.distance && firstMismatch === best.firstMismatch && lengthMismatch < best.lengthMismatch);
      if (better) {
        best = { candidate, distance, firstMismatch, lengthMismatch };
      }
    }
    if (best && best.distance <= 2) {
      return { isCorrect: false, word, suggestion: best.candidate };
    }
    return { isCorrect: false, word };
  }

  /**
   * Fetches daily content (word of the day, proverbs, rules, etc).
   * `bypassCache` skips both reading and writing `dailyContentCache` even
   * when `enableCache(true)` is on — used by `getRule()`'s retry loop, which
   * needs a fresh random `/icerik` draw on every attempt; without it, once
   * caching is enabled the loop would just re-read the same cached response
   * 25 times and could never find a rule outside that first random draw.
   */
  public static async getDailyContent(bypassCache = false): Promise<DailyContent | null> {
    if (!bypassCache && this.isCacheEnabled && this.dailyContentCache) return this.dailyContentCache;

    try {
      const response = await fetch(`${this.BASE_URL}/icerik`, {
        headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
      });
      if (response.ok) {
        const data = await response.json() as DailyContent;
        if (!bypassCache && this.isCacheEnabled) this.dailyContentCache = data;
        return data;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Returns today's word of the day along with all of its listed meanings.
   */
  public static async getWordOfTheDay(): Promise<WordOfTheDay | null> {
    const daily = await this.getDailyContent();
    if (!daily || daily.kelime.length === 0) return null;

    const word = daily.kelime[0].madde;
    const meanings = daily.kelime.filter((k) => k.madde === word).map((k) => k.anlam);
    return { word, meanings };
  }

  /**
   * Picks a random entry (word or proverb) from today's daily content.
   * Note: this samples from today's `getDailyContent()` picks, not the full dictionary.
   */
  public static async getRandomWord(): Promise<DailyPick | null> {
    const daily = await this.getDailyContent();
    if (!daily) return null;

    const pool: DailyPick[] = [
      ...daily.kelime.map((k) => ({ type: "kelime" as const, madde: k.madde, anlam: k.anlam })),
      ...daily.atasoz.map((a) => ({ type: "atasoz" as const, madde: a.madde, anlam: a.anlam })),
    ];
    if (pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Returns the spelling-rule page(s) ("yazım kuralları") linked from TDK's
   * `/icerik` daily-content feed, e.g. `{ adi: "Kısaltmalar", url: "https://..." }`.
   * Note: like `getRandomWord()`, this is NOT a fixed catalog — `/icerik`
   * appears to hand back a single randomly-rotated rule per request, so two
   * calls a second apart can return entirely different rules. `bypassCache`
   * (used internally by `getRule()`'s retry loop) forces a fresh `/icerik`
   * draw even when `enableCache(true)` is on.
   */
  public static async getKurallar(bypassCache = false): Promise<TDKRule[]> {
    const daily = await this.getDailyContent(bypassCache);
    return daily?.kural ?? [];
  }

  /**
   * Fetches the full plain-text content of a named spelling rule (matched
   * case-insensitively, substring match) from `tdk.gov.tr`. Since `/icerik`
   * hands back a single randomly-rotated rule per request (out of a pool of
   * roughly twenty) rather than a fixed catalog, a single `getKurallar()`
   * draw would rarely match a given name — this re-draws until it finds a
   * match or gives up. Draws happen in concurrent batches (each `/icerik`
   * request is independent and stateless) rather than one-at-a-time with a
   * delay: same total sample size (25) and hit probability as a sequential
   * loop, but bounded to a handful of round-trips instead of 25 of them, so
   * a miss resolves in roughly one round-trip time instead of several
   * seconds. Every draw bypasses `dailyContentCache` — without that, once
   * `enableCache(true)` is on, every attempt would just re-read the same
   * cached `/icerik` response and could never find a rule outside whatever
   * the first draw happened to be. Returns `null` if no match turns up
   * within the attempt budget or the matched page can't be parsed.
   */
  public static async getRule(name: string): Promise<string | null> {
    if (!name || name.trim() === "") return null;
    const target = name.trim().toLocaleLowerCase("tr-TR");

    const BATCH_SIZE = 5;
    const ROUNDS = 5;
    for (let round = 0; round < ROUNDS; round++) {
      const batches = await Promise.all(
        Array.from({ length: BATCH_SIZE }, () => this.getKurallar(true))
      );
      for (const rules of batches) {
        const match = rules.find((r) => r.adi.toLocaleLowerCase("tr-TR").includes(target));
        if (match) return this.fetchRuleText(match.url);
      }
    }
    return null;
  }

  /**
   * `tdk.gov.tr` rule pages are WordPress/Avada-themed. The actual article
   * text lives in `<div ... itemprop="text">...</div>` right before a
   * `<footer class="entry...">` (share buttons, author box, structured-data
   * spans) — cutting there avoids that trailing cruft.
   */
  private static async fetchRuleText(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" } });
      if (!response.ok) return null;
      const html = await response.text();

      const marker = html.indexOf('itemprop="text"');
      if (marker === -1) return null;
      const contentStart = html.indexOf(">", marker) + 1;
      const contentEnd = html.indexOf("<footer", contentStart);
      if (contentEnd === -1) return null;

      return this.htmlToPlainText(html.slice(contentStart, contentEnd));
    } catch {
      return null;
    }
  }

  private static htmlToPlainText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&rsquo;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * GETs a JSON path from Kubbealtı Lugatı's data API (`eski.lugatim.com`),
   * supplying `KUBBEALTI_EXTRA_CA` to work around that host's incomplete
   * certificate chain (see the constant's doc comment). Fails closed to
   * `null` on any error — network, TLS, HTTP, or JSON parse.
   */
  private static fetchKubbealtiJson(path: string): Promise<any> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: this.KUBBEALTI_HOST,
          path,
          method: "GET",
          ca: [...tls.rootCertificates, ...this.KUBBEALTI_EXTRA_CA],
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(null);
            return;
          }
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.end();
    });
  }

  /**
   * Returns Kubbealtı Lugatı ("Misalli Büyük Türkçe Sözlük") entries for a
   * word, scraped from the site's own data API — undocumented, and Kubbealtı
   * Lugatı is a commercial dictionary product, unlike TDK's or Wiktionary's
   * openly-published data, so use this in line with their terms. `anlam` is
   * raw HTML (rich typography markup); use `getKubbealtiMeanings()` for
   * plain text. Returns `null` on any fetch/parse failure, `[]` if the word
   * isn't found.
   */
  public static async getKubbealti(word: string): Promise<KubbealtiEntry[] | null> {
    if (!word || word.trim() === "") return null;
    const data = await this.fetchKubbealtiJson(`/rest/s/${encodeURIComponent(word.trim())}/`);
    if (!data || !Array.isArray(data.content)) return null;
    return data.content.map((entry: any) => ({ kelime: entry.kelime, anlam: entry.anlam }));
  }

  /**
   * Same as `getKubbealti()` but with each entry's `anlam` HTML stripped to
   * plain text via `htmlToPlainText()`.
   */
  public static async getKubbealtiMeanings(word: string): Promise<string[] | null> {
    const entries = await this.getKubbealti(word);
    if (!entries) return null;
    return entries.map((e) => this.htmlToPlainText(e.anlam));
  }

  /**
   * Autocomplete suggestions from Kubbealtı Lugatı's own typeahead endpoint
   * (separate from `getSuggestions()`, which uses TDK's data).
   */
  public static async getKubbealtiSuggestions(prefix: string): Promise<string[]> {
    if (!prefix || prefix.trim() === "") return [];
    const data = await this.fetchKubbealtiJson(`/rest/word-search/${encodeURIComponent(prefix.trim())}`);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => item.display).filter(Boolean);
  }

  /**
   * Returns compound words that contain this word.
   */
  public static async getCompoundWords(word: string): Promise<string[]> {
    const results = await this.getWord(word);
    if (results.length === 0) return [];
    
    const compound: string[] = [];
    for (const result of results) {
      if (result.birlesikler) {
        const words = result.birlesikler.split(',').map(w => w.trim());
        compound.push(...words);
      }
    }
    return [...new Set(compound)];
  }

  /**
   * Returns the part of speech (isim, sıfat, zarf vb.).
   * TDK's `ozelliklerListe` mixes grammatical categories (`tur: "3"`, e.g.
   * sıfat/zarf/isim) with usage-register tags (`tur: "4"`, e.g. mecaz/argo)
   * in the same list — only `tur === "3"` entries are actual parts of speech.
   */
  public static async getPartOfSpeech(word: string): Promise<string[]> {
    const results = await this.getWord(word);
    const pos = new Set<string>();

    for (const result of results) {
      if (result.anlamlarListe) {
        for (const anlam of result.anlamlarListe) {
          if (anlam.ozelliklerListe) {
            for (const ozellik of anlam.ozelliklerListe) {
              if (ozellik.tur === "3") pos.add(ozellik.tam_adi);
            }
          }
        }
      }
    }
    if (pos.size === 0 && results.length > 0) {
      pos.add('isim'); // Default to noun if TDK doesn't specify
    }
    return Array.from(pos);
  }

  /**
   * Compares two words side by side: meaning count, etymological origin,
   * syllables and vowel-harmony compliance.
   */
  public static async compareWords(a: string, b: string): Promise<WordComparison> {
    const [meaningsA, meaningsB, originA, originB] = await Promise.all([
      this.getMeanings(a),
      this.getMeanings(b),
      this.getOrigin(a),
      this.getOrigin(b),
    ]);
    return {
      a: {
        word: a,
        meaningCount: meaningsA.length,
        origin: originA,
        syllables: this.syllabicate(a),
        harmony: this.checkVowelHarmony(a),
      },
      b: {
        word: b,
        meaningCount: meaningsB.length,
        origin: originB,
        syllables: this.syllabicate(b),
        harmony: this.checkVowelHarmony(b),
      },
    };
  }

  private static readonly STOPWORDS = new Set([
    "ve", "veya", "ile", "ama", "fakat", "ancak", "de", "da", "ki", "bu", "şu", "o",
    "bir", "çok", "az", "gibi", "için", "mi", "mı", "mu", "mü", "ne", "her", "hiç",
    "ben", "sen", "biz", "siz", "onlar", "değil", "bile", "diye",
  ]);

  private static firstMeaning(results: WordInfo[]): string | null {
    for (const result of results) {
      for (const anlam of result.anlamlarListe ?? []) {
        if (anlam.anlam) return anlam.anlam;
      }
    }
    return null;
  }

  /**
   * Analyzes every distinct word in a text (Turkish stopwords filtered out),
   * returning each word's first meaning and etymological origin if found.
   * Looks each word up individually (throttled), so scales with text length.
   * TDK only indexes dictionary (dictionary/root) forms, not inflected ones —
   * it does no morphological analysis, and neither does this method: a
   * suffixed word like "evde" or "dildir" (root "ev"/"dil" plus a case/verb
   * suffix) will come back `found: false` even though the root is a real
   * headword. This is an inherent limitation of the data source, not a bug.
   */
  public static async analyzeText(text: string): Promise<WordAnalysis[]> {
    const words = text
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !this.STOPWORDS.has(w));
    const unique = [...new Set(words)];

    const analyses: WordAnalysis[] = [];
    for (const word of unique) {
      const results = await this.getWord(word);
      const found = results.length > 0;
      analyses.push({
        word,
        found,
        meaning: found ? this.firstMeaning(results) : null,
        origin: found ? results[0].lisan || "Türkçe" : null,
      });
      await this.delay(200);
    }
    return analyses;
  }

  /**
   * Damerau-Levenshtein edit-distance (optimal string alignment variant):
   * like classic Levenshtein but also counts an adjacent-character
   * transposition (e.g. "yanlız" -> "yalnız") as a single edit instead of
   * two substitutions — a very common class of typo that plain Levenshtein
   * otherwise misses.
   */
  private static damerauLevenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
        }
      }
    }
    return dp[a.length][b.length];
  }

  /**
   * Fetches multiple words concurrently with a small delay to avoid rate limiting.
   */
  public static async getWordsBatch(words: string[]): Promise<WordInfo[][]> {
    const results: WordInfo[][] = [];
    for (const word of words) {
      try {
        const res = await this.getWord(word);
        results.push(res);
      } catch {
        results.push([]);
      }
      await this.delay(200); // 200ms throttle
    }
    return results;
  }

  /**
   * Syllabicates a Turkish word based on general grammar rules.
   */
  public static syllabicate(word: string): string[] {
    const vowels = /[aeıioöuüAEIİOÖUÜ]/;
    const result: string[] = [];
    let currentSyllable = "";
    
    // Better basic syllabification: 
    // Go from right to left.
    for (let i = word.length - 1; i >= 0; i--) {
      currentSyllable = word[i] + currentSyllable;
      if (vowels.test(word[i])) {
        // If the preceding char is a consonant and it's not the first char
        // and the char before that is a vowel, then the consonant belongs to this syllable.
        if (i - 1 >= 0 && !vowels.test(word[i - 1])) {
          // It's a consonant.
          if (i - 2 >= 0 && vowels.test(word[i - 2])) {
            currentSyllable = word[i - 1] + currentSyllable;
            i--; // skip the consonant
          } else if (i - 2 >= 0 && !vowels.test(word[i - 2])) {
            // two consonants before this vowel. The one right before belongs to this syllable
            currentSyllable = word[i - 1] + currentSyllable;
            i--;
          }
        }
        result.unshift(currentSyllable);
        currentSyllable = "";
      }
    }
    // If there is anything left (e.g. no vowels at the start like "tr"), add it to the first syllable
    if (currentSyllable) {
      if (result.length > 0) {
        result[0] = currentSyllable + result[0];
      } else {
        result.push(currentSyllable);
      }
    }
    return result;
  }

  /**
   * Checks if a word follows Turkish Major Vowel Harmony (Büyük Ünlü Uyumu).
   * Normalizes case via the Turkish locale first: a plain case-insensitive
   * regex would fold ASCII "I" to "i", misreading the back vowel "I"
   * (dotless) as the front vowel "i" (dotted).
   */
  public static checkVowelHarmony(word: string): boolean {
    const lower = word.toLocaleLowerCase("tr-TR");
    const backVowels = /[aıou]/;
    const frontVowels = /[eiöü]/;
    const hasBack = backVowels.test(lower);
    const hasFront = frontVowels.test(lower);

    // If it has both front and back vowels, it breaks harmony.
    return !(hasBack && hasFront);
  }
}
