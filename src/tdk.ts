import type {
  WordInfo,
  DailyContent,
  SpellCheckResult,
  StemResult,
  WordOfTheDay,
  DailyPick,
  WordComparison,
  WordAnalysis,
  TDKRule,
  KubbealtiEntry,
  WiktionaryEntry,
  ProofreadIssue,
  ProofreadResult,
  PatternSearchOptions,
  AnagramOptions,
  RhymeOptions,
  RequestOptions,
  SuggestionOptions,
  TDKConfig,
} from "./types";
import { TDKError, TDKValidationError, TDKNetworkError, TDKParseError } from "./errors";
import { linkedTimeoutSignal, raceAbort } from "./lib/abort";
import { mapWithConcurrency } from "./lib/pool";
import { getStemCandidates } from "./morphology";
import { COMMON_MISSPELLINGS, SEY_EXCEPTIONS } from "./data/misspellings";
import { KUBBEALTI_EXTRA_CA } from "./data/kubbealti-ca";
import { WORD_FREQUENCY_RANKS } from "./data/word-frequency";
import { damerauLevenshtein, keyboardAwareDistance } from "./lib/edit-distance";
import { htmlToPlainText } from "./lib/html";
import { HeadwordStore } from "./lib/headword-store";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import * as tls from "node:tls";

export { COMMON_MISSPELLINGS, SEY_EXCEPTIONS } from "./data/misspellings";

const BASE_URL = "https://sozluk.gov.tr";
const AUDIO_API_HOST = "api.sozluk.gov.tr";
const KUBBEALTI_HOST = "eski.lugatim.com";
const HEADWORD_DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** The headword bundle is a few MB, so it gets more time than a JSON lookup. */
const BUNDLE_TIMEOUT_MS = 30_000;
const USER_AGENT = "TDK-API-Nodejs-Wrapper/1.0";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface HttpResponse {
  status: number;
  body: Buffer;
}

function isOk(res: HttpResponse): boolean {
  return res.status >= 200 && res.status < 300;
}

function httpError(source: string, res: HttpResponse): TDKNetworkError {
  return new TDKNetworkError(`${source}: HTTP ${res.status}.`, { status: res.status });
}

function toTDKError(error: unknown): TDKError {
  if (error instanceof TDKError) return error;
  if (error instanceof SyntaxError) return new TDKParseError(`Invalid JSON response: ${error.message}`, { cause: error });
  return new TDKNetworkError(error instanceof Error ? error.message : String(error), { cause: error });
}

const TURKISH_DEASCII_MAP: Record<string, string[]> = {
  a: ["â"],
  i: ["ı", "î"],
  o: ["ö"],
  u: ["ü", "û"],
  c: ["ç"],
  g: ["ğ"],
  s: ["ş"],
};

const STOPWORDS = new Set([
  "ve", "veya", "ile", "ama", "fakat", "ancak", "de", "da", "ki", "bu", "şu", "o",
  "bir", "çok", "az", "gibi", "için", "mi", "mı", "mu", "mü", "ne", "her", "hiç",
  "ben", "sen", "biz", "siz", "onlar", "değil", "bile", "diye",
]);

/**
 * Added to a spelling suggestion's score when the candidate isn't among the
 * common words in `WORD_FREQUENCY_RANKS`, so an everyday word beats an obscure
 * headword at a similar distance ("eksoz" → "egzoz", not "eksiz"). Tuned on
 * the single-word `COMMON_MISSPELLINGS` pairs: edit-distance-only fallback
 * got 40/52 right, this penalty 44/52 (graded rank terms scored no better).
 */
const UNCOMMON_WORD_PENALTY = 0.7;
let commonWords: Set<string> | null = null;
function isCommonWord(word: string): boolean {
  commonWords ??= new Set(WORD_FREQUENCY_RANKS.trim().split(/\s+/));
  return commonWords.has(word);
}

/** Shared by every client: the headword list is public data, not per-user state. */
const sharedHeadwords = new HeadwordStore();

/**
 * TDK (Türk Dil Kurumu) API client. Each instance has its own configuration
 * and caches (words, daily content, stems), so separate instances never share
 * settings or cached results. Only TDK's public headword list is shared
 * between instances. Most code uses the default `TDK` instance.
 */
export class TDKClient {
  // Configuration
  private defaultTimeoutMs = 8000;
  private defaultRetries = 1;
  private maxCacheSize = 1000;
  private concurrency = 4;

  // Cache Mechanism
  private isCacheEnabled = false;
  private wordCache = new Map<string, WordInfo[]>();
  private dailyContentCache: DailyContent | null = null;
  private stemCache = new Map<string, string | null>();
  private readonly headwords = sharedHeadwords;

  // Headword disk cache (opt-in)
  private diskCacheEnabled = false;
  private diskCacheDir: string | null = null;

  // Failure reporting
  private strict = false;
  private onError: ((error: TDKError) => void) | null = null;

  constructor(config?: TDKConfig) {
    if (config) this.configure(config);
  }

  /**
   * Configures this client's options such as network timeout, retries, and cache size.
   */
  public configure(config: TDKConfig): void {
    if (config.timeoutMs !== undefined) this.defaultTimeoutMs = Math.max(100, config.timeoutMs);
    if (config.retries !== undefined) this.defaultRetries = Math.max(0, config.retries);
    if (config.cache !== undefined) this.enableCache(config.cache);
    if (config.maxCacheSize !== undefined) this.maxCacheSize = Math.max(10, config.maxCacheSize);
    if (config.concurrency !== undefined) this.concurrency = Math.max(1, Math.floor(config.concurrency));
    if (config.diskCache !== undefined) this.diskCacheEnabled = config.diskCache;
    if (config.diskCacheDir !== undefined) this.diskCacheDir = config.diskCacheDir;
    if (config.strict !== undefined) this.strict = config.strict;
    if (config.onError !== undefined) this.onError = config.onError;
  }

  /**
   * Enables or disables in-memory caching for API requests.
   */
  public enableCache(status = true): void {
    this.isCacheEnabled = status;
    if (!status) {
      this.clearCache();
    }
  }

  /**
   * Clears this client's caches. The headword list is shared by all clients,
   * so it is cleared (and reloaded on next use) for every client.
   */
  public clearCache(): void {
    this.wordCache.clear();
    this.dailyContentCache = null;
    this.headwords.clear();
    this.stemCache.clear();
  }

  /**
   * Deletes the on-disk headword cache written when `diskCache` is enabled.
   * `clearCache()` only clears memory, so use this to force a fresh download.
   */
  public async clearDiskCache(): Promise<void> {
    const file = this.headwordDiskCachePath();
    if (!file) return;
    await fs.promises.rm(file, { force: true }).catch(() => {});
  }

  /**
   * LRU insert: `Map` keeps insertion order, so re-inserting moves a key to
   * the newest end and the first key is always the least recently used.
   */
  private setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V): void {
    map.delete(key);
    if (map.size >= this.maxCacheSize) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
    map.set(key, value);
  }

  /** LRU read: a hit is moved to the newest end so it is evicted last. */
  private getCached<K, V>(map: Map<K, V>, key: K): V | undefined {
    if (!map.has(key)) return undefined;
    const value = map.get(key)!;
    map.delete(key);
    map.set(key, value);
    return value;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Handles a failure inside a method that degrades to `null`/`[]` instead of
   * throwing. A caller-initiated abort is always rethrown, so cancellation
   * propagates even through these fail-silent methods. Otherwise the failure
   * is thrown in strict mode (`strict` overrides the client setting for
   * auxiliary lookups that must never fail their caller) or reported.
   */
  private softFail(error: unknown, signal?: AbortSignal, strict = this.strict): void {
    if (signal?.aborted) throw signal.reason;
    const tdkError = toTDKError(error);
    if (strict) throw tdkError;
    this.reportError(tdkError);
  }

  private reportError(error: TDKError): void {
    if (process.env.TDK_DEBUG) console.error(`[tdk-api-wrapper] ${error.name}: ${error.message}`);
    try {
      this.onError?.(error);
    } catch {
      // A throwing hook must not turn a handled failure into a crash.
    }
  }

  private fetchOnce(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<HttpResponse> {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, ...headers }, signal }).then(async (res) => ({
      status: res.status,
      body: Buffer.from(await res.arrayBuffer()),
    }));
  }

  /**
   * `node:https` transport for endpoints `fetch` can't talk to: `gts-yeni`
   * needs a manual `Origin` header (a forbidden header name for undici), and
   * Kubbealtı needs extra CA certificates.
   */
  private httpsOnce(options: https.RequestOptions, signal: AbortSignal): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      const req = https.request({ method: "GET", ...options, signal }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Performs a GET with a per-attempt timeout (covering the body download) and
   * automatic retry on network errors and 5xx responses. Resolves with any
   * response below 500 (and a 5xx on the last attempt); rejects with
   * `TDKNetworkError` once attempts run out, or with the abort reason if the
   * caller's `signal` fires.
   */
  private async request(
    target: string | https.RequestOptions,
    {
      signal,
      headers = {},
      retries = this.defaultRetries,
      timeoutMs = this.defaultTimeoutMs,
    }: RequestOptions & { headers?: Record<string, string>; retries?: number; timeoutMs?: number } = {}
  ): Promise<HttpResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw signal.reason;
      const linked = linkedTimeoutSignal(signal, timeoutMs);
      try {
        const res =
          typeof target === "string"
            ? await this.fetchOnce(target, headers, linked.signal)
            : await this.httpsOnce(target, linked.signal);
        if (res.status < 500 || attempt === retries) return res;
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
        lastError = err;
      } finally {
        linked.dispose();
      }
      if (attempt < retries) await this.delay(200 * (attempt + 1), signal);
    }
    const where = typeof target === "string" ? target : `https://${target.hostname}${target.path ?? ""}`;
    throw new TDKNetworkError(`Request to ${where} failed after ${retries + 1} attempts.`, {
      cause: lastError,
    });
  }

  /**
   * Fetches detailed information for a given word from the TDK Dictionary.
   */
  public async getWord(word: string, options: RequestOptions = {}): Promise<WordInfo[]> {
    if (!word || word.trim() === "") {
      throw new TDKValidationError("Word parameter cannot be empty.");
    }

    const cleanWord = word.trim().toLocaleLowerCase("tr-TR");

    if (this.isCacheEnabled) {
      const cached = this.getCached(this.wordCache, cleanWord);
      if (cached) return cached;
    }

    const url = `${BASE_URL}/gts?ara=${encodeURIComponent(cleanWord)}`;

    let response: HttpResponse;
    try {
      response = await this.request(url, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new TDKNetworkError("Failed to fetch word from TDK: request failed.", { cause: error });
    }

    if (!isOk(response)) {
      throw new TDKNetworkError(`Failed to fetch word from TDK: HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    let data: unknown;
    try {
      data = JSON.parse(response.body.toString("utf8"));
    } catch (error) {
      throw new TDKNetworkError("Failed to fetch word from TDK: invalid JSON response.", { cause: error });
    }

    if (!Array.isArray(data) && data && "error" in (data as Record<string, unknown>)) {
      if (this.isCacheEnabled) this.setBoundedCache(this.wordCache, cleanWord, []);
      return [];
    }

    const results = data as WordInfo[];
    if (this.isCacheEnabled) {
      this.setBoundedCache(this.wordCache, cleanWord, results);
    }
    return results;
  }

  /**
   * Helper method to get only the meanings (definitions) of a word as a string array.
   */
  public async getMeanings(word: string, options: RequestOptions = {}): Promise<string[]> {
    const results = await this.getWord(word, options);
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
   * this, this throws a `TDKParseError` that callers turn into `[]` (or
   * rethrow in strict mode). It takes no caller signal: the load is shared,
   * so one caller's abort must not cancel it.
   */
  private async fetchAutocompleteData(): Promise<string[]> {
    const home = await this.request(`${BASE_URL}/`);
    if (!isOk(home)) throw httpError("TDK home page", home);
    const scriptMatch = home.body.toString("utf8").match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!scriptMatch) throw new TDKParseError("TDK home page no longer links an /assets/index-*.js bundle.");

    const bundle = await this.request(`${BASE_URL}${scriptMatch[1]}`, {
      timeoutMs: Math.max(this.defaultTimeoutMs, BUNDLE_TIMEOUT_MS),
    });
    if (!isOk(bundle)) throw httpError("TDK JS bundle", bundle);
    const bundleJs = bundle.body.toString("utf8");

    const startMarker = 'JSON.parse(`[{"madde":';
    const startIdx = bundleJs.indexOf(startMarker);
    const jsonStart = startIdx + "JSON.parse(".length + 1;
    const jsonEnd = startIdx === -1 ? -1 : bundleJs.indexOf("`)", jsonStart);
    if (jsonEnd === -1) throw new TDKParseError("TDK JS bundle no longer embeds the headword list.");

    const data = JSON.parse(bundleJs.slice(jsonStart, jsonEnd)) as { madde: string }[];
    const words = data.map((item) => item.madde).filter(Boolean);
    if (words.length === 0) throw new TDKParseError("TDK JS bundle embeds an empty headword list.");
    return words;
  }

  private headwordDiskCachePath(): string | null {
    if (!this.diskCacheEnabled) return null;
    const dir =
      this.diskCacheDir ??
      (process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "tdk-api-wrapper")
        : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "tdk-api-wrapper"));
    return path.join(dir, "headwords.json");
  }

  private async readHeadwordDiskCache(): Promise<{ savedAt: number; words: string[] } | null> {
    const file = this.headwordDiskCachePath();
    if (!file) return null;
    try {
      const data = JSON.parse(await fs.promises.readFile(file, "utf8"));
      if (typeof data?.savedAt !== "number" || !Array.isArray(data.words) || data.words.length === 0) {
        return null;
      }
      return { savedAt: data.savedAt, words: data.words.filter((w: unknown) => typeof w === "string") };
    } catch {
      return null;
    }
  }

  private async writeHeadwordDiskCache(words: string[]): Promise<void> {
    const file = this.headwordDiskCachePath();
    if (!file) return;
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(tmp, JSON.stringify({ savedAt: Date.now(), words }));
      await fs.promises.rename(tmp, file);
    } catch {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /**
   * Resolves the headword list through its cache tiers: a fresh disk copy
   * (when `diskCache` is enabled), then the network, then a stale disk copy
   * if the network scrape fails (the failure is still reported). Throws when
   * no tier has the list.
   */
  private async loadHeadwords(): Promise<string[]> {
    const disk = await this.readHeadwordDiskCache();
    if (disk && Date.now() - disk.savedAt < HEADWORD_DISK_TTL_MS) return disk.words;

    try {
      const fresh = await this.fetchAutocompleteData();
      await this.writeHeadwordDiskCache(fresh);
      return fresh;
    } catch (error) {
      if (!disk) throw error;
      this.reportError(toTDKError(error));
      return disk.words;
    }
  }

  /**
   * Ensures TDK's ~81k headword list is loaded in memory for fast O(1) set operations.
   * Concurrent callers share one in-flight load; a failed load is reported (or
   * thrown in strict mode) and retried on the next call. An aborted `signal`
   * stops waiting without cancelling the shared load.
   */
  private async ensureAutocompleteLoaded(signal?: AbortSignal): Promise<void> {
    try {
      await raceAbort(
        this.headwords.ensure(() => this.loadHeadwords()),
        signal
      );
    } catch (error) {
      this.softFail(error, signal);
    }
  }

  /**
   * Loads TDK's headword list ahead of time (e.g. at process start) so later
   * `getInstantSuggestions()` calls hit memory. Resolves to whether it loaded.
   */
  public async preloadHeadwords(options: RequestOptions = {}): Promise<boolean> {
    await this.ensureAutocompleteLoaded(options.signal);
    return this.headwords.loaded;
  }

  /**
   * Synchronous autocomplete over the in-memory headword list: a binary search
   * on a Turkish-alphabet-sorted prefix index, so it runs in microseconds.
   * Returns `[]` until the list is loaded — call `preloadHeadwords()` (or any
   * async headword method) first, or use `getSuggestions()`.
   */
  public getInstantSuggestions(prefix: string, limit = 10, options: SuggestionOptions = {}): string[] {
    if (!prefix || prefix.trim() === "") return [];
    return this.headwords.search(prefix, limit, options.foldDiacritics);
  }

  /**
   * Returns autocomplete suggestions for a given prefix, searched over TDK's
   * full headword list (see `fetchAutocompleteData`). The list is fetched
   * and cached once per process regardless of `enableCache()` — the same
   * caching behavior as before — and only cleared by `clearCache()`.
   */
  public async getSuggestions(
    prefix: string,
    limit = 10,
    options: SuggestionOptions & RequestOptions = {}
  ): Promise<string[]> {
    if (!prefix || prefix.trim() === "") return [];

    await this.ensureAutocompleteLoaded(options.signal);
    return this.getInstantSuggestions(prefix, limit, options);
  }

  /**
   * Checks whether a word exists as a known headword in TDK dictionary.
   * Checks the in-memory headword set (81k headwords) if loaded, or queries TDK API.
   */
  public async isHeadword(word: string, options: RequestOptions = {}): Promise<boolean> {
    if (!word || word.trim() === "") return false;
    const clean = word.trim().toLocaleLowerCase("tr-TR");

    await this.ensureAutocompleteLoaded(options.signal);
    if (this.headwords.loaded) {
      return this.headwords.set.has(clean);
    }

    try {
      const results = await this.getWord(clean, options);
      return results.length > 0;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return false;
    }
  }

  /**
   * Generates candidate roots for a given Turkish word using progressive BFS suffix stripping,
   * consonant mutation restoration, and vowel drop restoration.
   */
  public getStemCandidates(word: string): string[] {
    return getStemCandidates(word);
  }

  /**
   * Finds the dictionary root (headword) of a word by checking direct existence
   * and evaluating candidate stems generated by morphological analysis.
   * Returns the root headword string if found, or null if no match in TDK.
   */
  public async findRoot(word: string, options: RequestOptions = {}): Promise<string | null> {
    if (!word || word.trim() === "") return null;
    const clean = word.trim().toLocaleLowerCase("tr-TR");

    const cachedRoot = this.getCached(this.stemCache, clean);
    if (cachedRoot !== undefined) return cachedRoot;

    // 1. If the word itself is an exact headword, it is its own root
    if (await this.isHeadword(clean, options)) {
      this.setBoundedCache(this.stemCache, clean, clean);
      return clean;
    }

    // 2. Test morphological stem candidates
    const candidates = getStemCandidates(clean);
    for (const candidate of candidates) {
      if (await this.isHeadword(candidate, options)) {
        this.setBoundedCache(this.stemCache, clean, candidate);
        return candidate;
      }
    }

    this.setBoundedCache(this.stemCache, clean, null);
    return null;
  }

  /**
   * Performs morphological stemming on a Turkish word.
   * Returns a StemResult containing the original word, resolved root, and whether it is inflected.
   */
  public async stem(word: string, options: RequestOptions = {}): Promise<StemResult | null> {
    if (!word || word.trim() === "") return null;
    const clean = word.trim().toLocaleLowerCase("tr-TR");
    const root = await this.findRoot(word, options);

    if (!root) {
      return null;
    }

    return {
      word,
      root,
      isInflected: root !== clean,
      candidates: getStemCandidates(word),
    };
  }

  /**
   * Returns a list of proverbs and idioms containing the word.
   */
  public async getProverbs(word: string, options: RequestOptions = {}): Promise<string[]> {
    const results = await this.getWord(word, options);
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
   * record a foreign origin for it. With `fallbackStem`, an inflected word
   * that isn't a headword itself ("kitaplarımız") reports its root's origin.
   * Returns `null` only when neither the word nor its root is found.
   */
  public async getOrigin(
    word: string,
    fallbackStem = false,
    options: RequestOptions = {}
  ): Promise<string | null> {
    const results = await this.getWord(word, options);
    if (results.length > 0) return results[0].lisan || "Türkçe";
    if (!fallbackStem) return null;

    const root = await this.findRoot(word, options);
    if (!root || root === word.trim().toLocaleLowerCase("tr-TR")) return null;
    const rootResults = await this.getWord(root, options);
    return rootResults.length > 0 ? rootResults[0].lisan || "Türkçe" : null;
  }

  /**
   * Returns whether the word has a recorded foreign etymological origin.
   * Returns `null` (instead of a boolean) when the word isn't found at all.
   */
  public async isForeignWord(word: string, options: RequestOptions = {}): Promise<boolean | null> {
    const origin = await this.getOrigin(word, false, options);
    if (origin === null) return null;
    return origin !== "Türkçe";
  }

  /**
   * Groups a list of words by their etymological origin. Words not found in
   * the dictionary are grouped under "Bilinmiyor". Lookups run with bounded
   * concurrency like getWordsBatch; groups keep the input order.
   */
  public async groupByOrigin(words: string[], options: RequestOptions = {}): Promise<Record<string, string[]>> {
    const unique = [...new Set(words)];
    const origins = await mapWithConcurrency(
      unique,
      this.concurrency,
      (word) => this.getOrigin(word, false, options),
      options.signal
    );
    const originOf = new Map(unique.map((word, i) => [word, origins[i] ?? "Bilinmiyor"]));

    const groups: Record<string, string[]> = {};
    for (const word of words) {
      const origin = originOf.get(word)!;
      if (!groups[origin]) groups[origin] = [];
      groups[origin].push(word);
    }
    return groups;
  }

  /**
   * Returns literature examples containing the word.
   */
  public async getExamples(
    word: string,
    options: RequestOptions = {}
  ): Promise<{ sentence: string; author: string | null }[]> {
    const results = await this.getWord(word, options);
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
  private async fetchGtsYeni(word: string, signal?: AbortSignal): Promise<any[] | null> {
    try {
      const res = await this.request(
        {
          hostname: AUDIO_API_HOST,
          path: `/gts-yeni?ara=${encodeURIComponent(word)}`,
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
          },
        },
        { signal }
      );
      if (!isOk(res)) throw httpError("TDK gts-yeni", res);
      const data = JSON.parse(res.body.toString("utf8"));
      // An unknown word comes back as `[]`; anything else non-array means the endpoint changed.
      if (!Array.isArray(data)) throw new TDKParseError("TDK gts-yeni response is not an array.");
      return data;
    } catch (error) {
      this.softFail(error, signal);
      return null;
    }
  }

  private async fetchSeskod(word: string, signal?: AbortSignal): Promise<string | null> {
    const data = await this.fetchGtsYeni(word, signal);
    const seskod = data?.[0]?.seskod;
    return seskod ? String(seskod) : null;
  }

  /**
   * Returns synonyms ("eş anlamlı kelimeler") recorded for the word, pooled
   * across all of its meanings. Uses the same undocumented `gts-yeni`
   * endpoint as `getAudioUrl` — returns `[]` if the lookup fails.
   */
  public async getSynonyms(word: string, options: RequestOptions = {}): Promise<string[]> {
    if (!word || word.trim() === "") return [];
    const data = await this.fetchGtsYeni(word.trim().toLocaleLowerCase("tr-TR"), options.signal);
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
  public async getAntonyms(word: string, options: RequestOptions = {}): Promise<string[]> {
    if (!word || word.trim() === "") return [];
    const data = await this.fetchGtsYeni(word.trim().toLocaleLowerCase("tr-TR"), options.signal);
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
  public async getAudioUrl(word: string, options: RequestOptions = {}): Promise<string | null> {
    if (!word || word.trim() === "") {
      throw new TDKValidationError("Word parameter cannot be empty.");
    }

    const seskod = await this.fetchSeskod(word.trim().toLocaleLowerCase("tr-TR"), options.signal);
    if (!seskod) return null;
    return `https://${AUDIO_API_HOST}/ses/${encodeURIComponent(seskod)}.wav`;
  }

  /**
   * Downloads the audio pronunciation to the specified path.
   */
  public async downloadAudio(
    word: string,
    destPath?: string,
    options: RequestOptions = {}
  ): Promise<string | null> {
    const url = await this.getAudioUrl(word, options);
    if (!url) return null;

    const finalPath = destPath || path.join(os.tmpdir(), `${word}.wav`);
    try {
      const res = await this.request(url, options);
      if (!isOk(res)) throw httpError("TDK audio download", res);
      await fs.promises.writeFile(finalPath, res.body);
      return finalPath;
    } catch (error) {
      this.softFail(error, options.signal);
      return null;
    }
  }

  /**
   * Checks spelling and returns suggestions if wrong.
   */
  public async checkSpelling(word: string, options: RequestOptions = {}): Promise<SpellCheckResult> {
    if (!word || word.trim() === "") {
      return { isCorrect: false, word };
    }

    const cleanWord = word.trim().toLocaleLowerCase("tr-TR");

    // 1. Check if word exists in TDK dictionary
    const results = await this.getWord(word, options);
    if (results.length > 0) {
      return { isCorrect: true, word };
    }

    // 2. Common Turkish misspellings, erroneously joined compounds, and vowel drop errors
    if (COMMON_MISSPELLINGS[cleanWord]) {
      return { isCorrect: false, word, suggestion: COMMON_MISSPELLINGS[cleanWord] };
    }

    // 3. Dynamic -şey / -sey attached check:
    // In Turkish, 'şey' is an indefinite pronoun and is ALWAYS written separately from the preceding word
    // (e.g. her şey, bir şey, hiçbir şey, çok şey, her şeyi, bir şeyler).
    const seyMatch = cleanWord.match(/^(.+?)(?:şey|sey)([ıiuaeüodekmnl]+)?$/);
    if (seyMatch && !SEY_EXCEPTIONS.has(cleanWord)) {
      let prefix = seyMatch[1];
      const suffix = seyMatch[2] || "";
      if (prefix === "hicbir") prefix = "hiçbir";
      if (prefix === "cok") prefix = "çok";
      return {
        isCorrect: false,
        word,
        suggestion: `${prefix} şey${suffix}`,
      };
    }

    // 4. "Sıkça yapılan yanlışlar" from DailyContent
    // Auxiliary: a failing /icerik must not fail the spell check, even in strict mode.
    const daily = await this.fetchDailyContent(false, options.signal, false);
    if (daily) {
      const syydMatch = daily.syyd.find((s) => s.yanliskelime.toLocaleLowerCase("tr-TR") === cleanWord);
      if (syydMatch) {
        return { isCorrect: false, word, suggestion: syydMatch.dogrukelime };
      }
      const mixMatch = daily.karistirma.find((s) => s.yanlis.toLocaleLowerCase("tr-TR") === cleanWord);
      if (mixMatch) {
        return { isCorrect: false, word, suggestion: mixMatch.dogru };
      }
    }

    // 5. Morphology Fallback: Check if the word is an inflected form or bare verb imperative of a known headword
    // (e.g., "halılarımızın" -> "halı", "kitabımız" -> "kitap", "çocuğa" -> "çocuk", "söyle" -> "söylemek")
    const root = await this.findRoot(word, options);
    if (root) {
      const isInflected = root !== cleanWord;
      return {
        isCorrect: true,
        word,
        isInflected,
        root,
      };
    }

    // 6. Check if headwords with spaces match when space is removed (e.g. "ön yargı" for "önyargı")
    await this.ensureAutocompleteLoaded(options.signal);
    for (const candidate of this.headwords.words) {
      if (candidate.includes(" ")) {
        const candidateNoSpace = candidate.replace(/\s+/g, "").toLocaleLowerCase("tr-TR");
        if (candidateNoSpace === cleanWord) {
          return { isCorrect: false, word, suggestion: candidate };
        }
      }
    }

    // 7. No exact match or morphology root: fall back to closest headword by edit distance.
    // Candidates are ranked by the keyboard-/diacritic-aware distance (so "arabs" picks
    // "araba" over an equidistant headword because s->a is a neighbouring-key slip, and
    // "swlam" picks "selam" because w->e is), while the plain integer Damerau-Levenshtein
    // still gates acceptance. Ties prefer matching first letter, then matching length, and
    // initial character mismatches are penalized so irrelevant foreign loanwords (like
    // 'jersey') do not beat Turkish roots. Headwords outside the common-word frequency list
    // pay UNCOMMON_WORD_PENALTY, so the likelier everyday word wins among close candidates.
    let best:
      | { candidate: string; score: number; rawDist: number; firstMismatch: number; lengthMismatch: number }
      | null = null;
    for (const candidate of this.headwords.words) {
      if (candidate.includes(" ") || candidate !== candidate.toLocaleLowerCase("tr-TR")) continue;
      if (Math.abs(candidate.length - cleanWord.length) > 2) continue;

      const rawDist = damerauLevenshtein(cleanWord, candidate);
      if (rawDist === 0 || rawDist > 2) continue;

      const firstMismatch = candidate[0] === cleanWord[0] ? 0 : 1;
      const lengthMismatch = candidate.length === cleanWord.length ? 0 : 1;
      const score =
        keyboardAwareDistance(cleanWord, candidate) +
        (firstMismatch > 0 ? 1.2 : 0) +
        (isCommonWord(candidate) ? 0 : UNCOMMON_WORD_PENALTY);

      const better =
        !best ||
        score < best.score - 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 && firstMismatch < best.firstMismatch) ||
        (Math.abs(score - best.score) < 1e-9 &&
          firstMismatch === best.firstMismatch &&
          lengthMismatch < best.lengthMismatch);
      if (better) {
        best = { candidate, score, rawDist, firstMismatch, lengthMismatch };
      }
    }
    if (best && best.rawDist <= 2 && (best.firstMismatch === 0 || best.rawDist <= 1)) {
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
  public getDailyContent(bypassCache = false, options: RequestOptions = {}): Promise<DailyContent | null> {
    return this.fetchDailyContent(bypassCache, options.signal);
  }

  private async fetchDailyContent(
    bypassCache: boolean,
    signal?: AbortSignal,
    strict = this.strict
  ): Promise<DailyContent | null> {
    if (!bypassCache && this.isCacheEnabled && this.dailyContentCache) return this.dailyContentCache;

    try {
      const response = await this.request(`${BASE_URL}/icerik`, { signal });
      if (!isOk(response)) throw httpError("TDK daily content", response);
      const data = JSON.parse(response.body.toString("utf8")) as DailyContent;
      if (!bypassCache && this.isCacheEnabled) this.dailyContentCache = data;
      return data;
    } catch (error) {
      this.softFail(error, signal, strict);
      return null;
    }
  }

  /**
   * Returns today's word of the day along with all of its listed meanings.
   */
  public async getWordOfTheDay(options: RequestOptions = {}): Promise<WordOfTheDay | null> {
    const daily = await this.getDailyContent(false, options);
    if (!daily || daily.kelime.length === 0) return null;

    const word = daily.kelime[0].madde;
    const meanings = daily.kelime.filter((k) => k.madde === word).map((k) => k.anlam);
    return { word, meanings };
  }

  /**
   * Picks a random entry (word or proverb) from today's daily content.
   * Note: this samples from today's `getDailyContent()` picks, not the full dictionary.
   */
  public async getRandomWord(options: RequestOptions = {}): Promise<DailyPick | null> {
    const daily = await this.getDailyContent(false, options);
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
  public async getKurallar(bypassCache = false, options: RequestOptions = {}): Promise<TDKRule[]> {
    const daily = await this.getDailyContent(bypassCache, options);
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
  public async getRule(name: string, options: RequestOptions = {}): Promise<string | null> {
    if (!name || name.trim() === "") return null;
    const target = name.trim().toLocaleLowerCase("tr-TR");

    const BATCH_SIZE = 5;
    const ROUNDS = 5;
    for (let round = 0; round < ROUNDS; round++) {
      const batches = await Promise.all(
        Array.from({ length: BATCH_SIZE }, () => this.getKurallar(true, options))
      );
      for (const rules of batches) {
        const match = rules.find((r) => r.adi.toLocaleLowerCase("tr-TR").includes(target));
        if (match) return this.fetchRuleText(match.url, options.signal);
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
  private async fetchRuleText(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const response = await this.request(url, { signal });
      if (!isOk(response)) throw httpError("TDK rule page", response);
      const html = response.body.toString("utf8");

      const marker = html.indexOf('itemprop="text"');
      const contentStart = html.indexOf(">", marker) + 1;
      const contentEnd = marker === -1 ? -1 : html.indexOf("<footer", contentStart);
      if (contentEnd === -1) throw new TDKParseError(`Rule page ${url} no longer has the expected article markup.`);

      return htmlToPlainText(html.slice(contentStart, contentEnd));
    } catch (error) {
      this.softFail(error, signal);
      return null;
    }
  }

  /**
   * GETs a JSON path from Kubbealtı Lugatı's data API (`eski.lugatim.com`),
   * supplying `KUBBEALTI_EXTRA_CA` to work around that host's incomplete
   * certificate chain (see the constant's doc comment). Fails closed to
   * `null` on any error — network, TLS, HTTP, or JSON parse.
   */
  private async fetchKubbealtiJson(path: string, signal?: AbortSignal): Promise<any> {
    try {
      const res = await this.request(
        {
          hostname: KUBBEALTI_HOST,
          path,
          ca: [...tls.rootCertificates, ...KUBBEALTI_EXTRA_CA],
          headers: { "User-Agent": BROWSER_USER_AGENT },
        },
        { signal }
      );
      if (res.status !== 200) throw httpError("Kubbealtı Lugatı", res);
      return JSON.parse(res.body.toString("utf8"));
    } catch (error) {
      this.softFail(error, signal);
      return null;
    }
  }

  /**
   * Kubbealtı indexes headwords with full classical Turkish orthography,
   * including letters that a plain-ASCII-ish query tends to drop — most
   * commonly ü/ö/ç/ğ/ş, but also the circumflex ("düzeltme işareti") used in
   * Arabic/Persian loanwords like "rüzgâr". A search for "ruzgar" misses
   * entirely (verified: even "ruzgâr" alone still misses — it's the missing
   * ü, not the missing â, that actually breaks the match). This generates
   * single-letter-substitution variants to retry, one substitution per
   * variant (not combinatorial) — covers the overwhelmingly common case of
   * one "de-Turkished" letter without an explosion of API calls for words
   * with several.
   */
  private generateTurkishVariants(word: string): string[] {
    const lower = word.trim().toLocaleLowerCase("tr-TR");
    const variants: string[] = [];
    for (let i = 0; i < lower.length; i++) {
      for (const replacement of TURKISH_DEASCII_MAP[lower[i]] ?? []) {
        variants.push(lower.slice(0, i) + replacement + lower.slice(i + 1));
      }
    }
    return variants;
  }

  /**
   * Returns Kubbealtı Lugatı ("Misalli Büyük Türkçe Sözlük") entries for a
   * word, scraped from the site's own data API — undocumented, and Kubbealtı
   * Lugatı is a commercial dictionary product, unlike TDK's or Wiktionary's
   * openly-published data, so use this in line with their terms. `anlam` is
   * raw HTML (rich typography markup); use `getKubbealtiMeanings()` for
   * plain text. Falls back to `generateTurkishVariants()` if the exact query
   * comes up empty (see its doc comment). Returns `null` on any fetch/parse
   * failure, `[]` if no variant matches either.
   */
  public async getKubbealti(word: string, options: RequestOptions = {}): Promise<KubbealtiEntry[] | null> {
    if (!word || word.trim() === "") return null;

    const data = await this.fetchKubbealtiJson(`/rest/s/${encodeURIComponent(word.trim())}/`, options.signal);
    if (!data) return null;
    if (!Array.isArray(data.content)) {
      this.softFail(new TDKParseError("Kubbealtı Lugatı search response has no content array."), options.signal);
      return null;
    }
    if (data.content.length > 0) {
      return data.content.map((entry: any) => ({ kelime: entry.kelime, anlam: entry.anlam }));
    }

    for (const variant of this.generateTurkishVariants(word)) {
      const variantData = await this.fetchKubbealtiJson(
        `/rest/s/${encodeURIComponent(variant)}/`,
        options.signal
      );
      if (variantData && Array.isArray(variantData.content) && variantData.content.length > 0) {
        return variantData.content.map((entry: any) => ({ kelime: entry.kelime, anlam: entry.anlam }));
      }
    }
    return [];
  }

  /**
   * Same as `getKubbealti()` but with each entry's `anlam` HTML stripped to
   * plain text via `htmlToPlainText()`.
   */
  public async getKubbealtiMeanings(word: string, options: RequestOptions = {}): Promise<string[] | null> {
    const entries = await this.getKubbealti(word, options);
    if (!entries) return null;
    return entries.map((e) => htmlToPlainText(e.anlam));
  }

  /**
   * Autocomplete suggestions from Kubbealtı Lugatı's own typeahead endpoint
   * (separate from `getSuggestions()`, which uses TDK's data).
   */
  public async getKubbealtiSuggestions(prefix: string, options: RequestOptions = {}): Promise<string[]> {
    if (!prefix || prefix.trim() === "") return [];
    const data = await this.fetchKubbealtiJson(
      `/rest/word-search/${encodeURIComponent(prefix.trim())}`,
      options.signal
    );
    if (data === null) return [];
    if (!Array.isArray(data)) {
      this.softFail(new TDKParseError("Kubbealtı Lugatı suggestion response is not an array."), options.signal);
      return [];
    }
    return data.map((item: any) => item.display).filter(Boolean);
  }

  /**
   * Returns the etymology paragraph for a word from Nişanyan Sözlük, scraped
   * from that page's server-rendered `<meta name="description">` tag (the
   * page already puts the full etymology text there for SEO, so no need to
   * parse the site's internal SvelteKit data format). Returns `null` if the
   * word isn't found (the page falls back to a generic site tagline in that
   * case) or the request fails.
   */
  public async getNisanyan(word: string, options: RequestOptions = {}): Promise<string | null> {
    if (!word || word.trim() === "") return null;
    try {
      const response = await this.request(
        `https://www.nisanyansozluk.com/kelime/${encodeURIComponent(word.trim().toLocaleLowerCase("tr-TR"))}`,
        options
      );
      if (!isOk(response)) throw httpError("Nişanyan Sözlük", response);
      const html = response.body.toString("utf8");
      const match = html.match(/<meta name="description" content="([^"]*)"/);
      if (!match) throw new TDKParseError("Nişanyan Sözlük page no longer has a description meta tag.");
      const description = htmlToPlainText(match[1]);
      if (description === "Çağdaş Türkçenin Etimolojisi") return null;
      return description;
    } catch (error) {
      this.softFail(error, options.signal);
      return null;
    }
  }

  private async fetchWiktionaryEntry(title: string, signal?: AbortSignal): Promise<WiktionaryEntry | null> {
    try {
      const url = `https://tr.wiktionary.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(
        title
      )}&format=json&explaintext=1&formatversion=2`;
      const response = await this.request(url, { signal });
      if (!isOk(response)) throw httpError("Wiktionary API", response);
      const data = JSON.parse(response.body.toString("utf8"));
      const page = data?.query?.pages?.[0];
      if (!page || page.missing || !page.extract) return null;

      const raw: string = page.extract;
      const sections: Record<string, string> = {};
      const parts = raw.split(/\n(={2,4})\s*(.+?)\s*\1\n/);
      // parts[0] is text before the first heading (usually empty); after
      // that, headings and their following text alternate in triples.
      for (let i = 1; i < parts.length; i += 3) {
        const title = parts[i + 1]?.trim();
        const content = parts[i + 2]?.trim();
        if (title) sections[title] = content ?? "";
      }
      return { raw, sections };
    } catch (error) {
      this.softFail(error, signal);
      return null;
    }
  }

  /**
   * Returns the Turkish Wiktionary (`tr.wiktionary.org`) entry for a word,
   * via MediaWiki's official Action API (`action=query&prop=extracts`) — no
   * scraping involved, this is a stable, documented public API. `sections`
   * splits the plain-text extract on its `== Heading ==`/`=== Heading ===`
   * markers (e.g. "Köken", "Söyleniş", "Ad") for convenience; `raw` has the
   * unsplit text. This wiki has title capitalization turned off
   * ($wgCapitalLinks=false — common for Wiktionaries, since case is
   * meaningful for a dictionary: "Türkiye" the country vs. a lowercase
   * common word), so an exact-case miss retries with the first letter
   * uppercased (Turkish-locale-aware, so "istanbul" tries "İstanbul", not
   * "Istanbul") before giving up. Returns `null` if neither is found or the
   * request fails.
   */
  public async getWiktionary(word: string, options: RequestOptions = {}): Promise<WiktionaryEntry | null> {
    if (!word || word.trim() === "") return null;
    const trimmed = word.trim();

    const direct = await this.fetchWiktionaryEntry(trimmed, options.signal);
    if (direct) return direct;

    const capitalized = trimmed.charAt(0).toLocaleUpperCase("tr-TR") + trimmed.slice(1);
    if (capitalized === trimmed) return null;
    return this.fetchWiktionaryEntry(capitalized, options.signal);
  }

  /**
   * Convenience filter over `getWiktionary()`: returns just one section's
   * text (e.g. `getWiktionarySection(word, "Köken")` for etymology), matched
   * case-insensitively. Returns `null` if the word or the section isn't found.
   */
  public async getWiktionarySection(
    word: string,
    sectionName: string,
    options: RequestOptions = {}
  ): Promise<string | null> {
    const entry = await this.getWiktionary(word, options);
    if (!entry) return null;
    const key = Object.keys(entry.sections).find(
      (k) => k.toLocaleLowerCase("tr-TR") === sectionName.trim().toLocaleLowerCase("tr-TR")
    );
    return key ? entry.sections[key] : null;
  }

  /**
   * Returns compound words that contain this word.
   */
  public async getCompoundWords(word: string, options: RequestOptions = {}): Promise<string[]> {
    const results = await this.getWord(word, options);
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
  public async getPartOfSpeech(word: string, options: RequestOptions = {}): Promise<string[]> {
    const results = await this.getWord(word, options);
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
  public async compareWords(a: string, b: string, options: RequestOptions = {}): Promise<WordComparison> {
    const [meaningsA, meaningsB, originA, originB] = await Promise.all([
      this.getMeanings(a, options),
      this.getMeanings(b, options),
      this.getOrigin(a, false, options),
      this.getOrigin(b, false, options),
    ]);
    return {
      a: {
        word: a,
        meaningCount: meaningsA.length,
        origin: originA,
        syllables: this.syllabicate(a),
        harmony: this.checkVowelHarmony(a),
        labialHarmony: this.checkLabialHarmony(a),
      },
      b: {
        word: b,
        meaningCount: meaningsB.length,
        origin: originB,
        syllables: this.syllabicate(b),
        harmony: this.checkVowelHarmony(b),
        labialHarmony: this.checkLabialHarmony(b),
      },
    };
  }

  private firstMeaning(results: WordInfo[]): string | null {
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
   * Looks each distinct word up individually (bounded concurrency), so scales with text length.
   * TDK only indexes dictionary (dictionary/root) forms, not inflected ones —
   * it does no morphological analysis, and neither does this method: a
   * suffixed word like "evde" or "dildir" (root "ev"/"dil" plus a case/verb
   * suffix) will come back `found: false` even though the root is a real
   * headword. This is an inherent limitation of the data source, not a bug.
   */
  public async analyzeText(text: string, options: RequestOptions = {}): Promise<WordAnalysis[]> {
    const words = text
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w));
    const unique = [...new Set(words)];

    return mapWithConcurrency(unique, this.concurrency, (word) => this.analyzeWord(word, options), options.signal);
  }

  private async analyzeWord(word: string, options: RequestOptions): Promise<WordAnalysis> {
    let results = await this.getWord(word, options);
    let found = results.length > 0;
    let root: string | undefined;
    let isInflected: boolean | undefined;

    if (!found) {
      const resolvedRoot = await this.findRoot(word, options);
      if (resolvedRoot) {
        results = await this.getWord(resolvedRoot, options);
        if (results.length > 0) {
          found = true;
          root = resolvedRoot;
          isInflected = true;
        }
      }
    }

    return {
      word,
      found,
      meaning: found ? this.firstMeaning(results) : null,
      origin: found ? results[0].lisan || "Türkçe" : null,
      root,
      isInflected,
    };
  }

  /**
   * Fetches multiple words with bounded concurrency (`concurrency`, default 4).
   * Repeated words (case-insensitive) are fetched once; results keep the input
   * order, and a word whose lookup fails yields `[]`.
   */
  public async getWordsBatch(words: string[], options: RequestOptions = {}): Promise<WordInfo[][]> {
    const keyOf = (word: string) => (word ?? "").trim().toLocaleLowerCase("tr-TR");
    const unique = [...new Set(words.map(keyOf))];
    const fetched = await mapWithConcurrency(
      unique,
      this.concurrency,
      async (word) => {
        try {
          return await this.getWord(word, options);
        } catch (error) {
          if (options.signal?.aborted) throw error;
          return [];
        }
      },
      options.signal
    );
    const byKey = new Map(unique.map((word, i) => [word, fetched[i]]));
    return words.map((word) => byKey.get(keyOf(word))!);
  }

  /**
   * Syllabicates a Turkish word based on general grammar rules.
   * Handles syllable separation for vowels, single consonants, double consonants,
   * and western loanword three-consonant clusters (e.g. e-lek-trik, kon-trol, or-kes-tra).
   */
  public syllabicate(word: string): string[] {
    const vowels = /[aeıioöuüAEIİOÖUÜ]/;
    const ONSET_CLUSTERS = new Set(["tr", "pr", "kr", "gr", "br", "fr", "dr", "pl", "kl", "fl", "bl", "gl"]);
    const result: string[] = [];
    let currentSyllable = "";
    
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
            // Two consonants before this vowel. Check if three consonants exist and end in an onset cluster
            if (i - 3 >= 0 && !vowels.test(word[i - 3]) && ONSET_CLUSTERS.has((word[i - 2] + word[i - 1]).toLowerCase())) {
              currentSyllable = word[i - 2] + word[i - 1] + currentSyllable;
              i -= 2;
            } else {
              currentSyllable = word[i - 1] + currentSyllable;
              i--;
            }
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
  public checkVowelHarmony(word: string): boolean {
    const lower = word.toLocaleLowerCase("tr-TR");
    const backVowels = /[aıou]/;
    const frontVowels = /[eiöü]/;
    const hasBack = backVowels.test(lower);
    const hasFront = frontVowels.test(lower);

    // If it has both front and back vowels, it breaks harmony.
    return !(hasBack && hasFront);
  }

  /**
   * Checks if a word follows Turkish Minor Vowel Harmony (Küçük Ünlü Uyumu / Labial Harmony).
   * Rules:
   * 1. After an unrounded vowel (a, e, ı, i), only unrounded vowels (a, e, ı, i) can follow.
   * 2. After a rounded vowel (o, ö, u, ü), either an unrounded wide (a, e) or rounded narrow (u, ü) vowel can follow.
   * Single-syllable words and words with <=1 vowel are considered compliant by convention.
   */
  public checkLabialHarmony(word: string): boolean {
    const lower = word.toLocaleLowerCase("tr-TR");
    const vowels = lower.split("").filter((ch) => "aeıioöuü".includes(ch));
    if (vowels.length <= 1) return true;

    for (let i = 0; i < vowels.length - 1; i++) {
      const v1 = vowels[i];
      const v2 = vowels[i + 1];

      if ("aeıi".includes(v1)) {
        if (!"aeıi".includes(v2)) return false;
      } else if ("oöuü".includes(v1)) {
        if (!"aeuü".includes(v2)) return false;
      }
    }
    return true;
  }

  /**
   * Searches TDK headwords using a wildcard / pattern string.
   * Wildcards:
   *   '_' or '?' matches any single character
   *   '*' matches zero or more characters
   * Example: "k_l_m" matches "kalem", "kelam", "kilim".
   * Runs in-memory against TDK's 81k headword list.
   */
  public async patternSearch(pattern: string, options?: PatternSearchOptions): Promise<string[]> {
    if (!pattern || pattern.trim() === "") return [];
    await this.ensureAutocompleteLoaded(options?.signal);

    const cleanPattern = pattern.trim().toLocaleLowerCase("tr-TR");
    const escaped = cleanPattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/[_?]/g, "[\\p{L}]")
      .replace(/\*/g, "[\\p{L}]*");
    const regex = new RegExp(`^${escaped}$`, "u");

    const max = options?.maxResults ?? 50;
    const matches: string[] = [];

    for (const headword of this.headwords.words) {
      const lower = headword.toLocaleLowerCase("tr-TR");
      if (regex.test(lower)) {
        matches.push(headword);
        if (matches.length >= max) break;
      }
    }
    return matches;
  }

  /**
   * Finds headwords in TDK that can be formed from the given letters (anagrams).
   * If exact-length anagrams exist, they are returned.
   * If none exist (or exactLength is false), valid sub-anagrams (words using a subset of the letters,
   * minimum 3 letters) are returned, sorted by length descending.
   */
  public async findAnagrams(letters: string, options?: AnagramOptions): Promise<string[]> {
    if (!letters || letters.trim() === "") return [];
    await this.ensureAutocompleteLoaded(options?.signal);

    const clean = letters.trim().toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşüâîû]/gi, "");
    if (clean.length === 0) return [];

    const forceExact = options?.exactLength === true;
    const max = options?.maxResults ?? 50;

    const getFrequency = (str: string): Record<string, number> => {
      const freq: Record<string, number> = {};
      for (const ch of str) {
        freq[ch] = (freq[ch] || 0) + 1;
      }
      return freq;
    };

    const targetFreq = getFrequency(clean);
    const exactMatches: string[] = [];
    const subMatches: string[] = [];

    for (const headword of this.headwords.words) {
      const lower = headword.toLocaleLowerCase("tr-TR");
      if (lower.includes(" ") || lower.includes("-")) continue;
      if (lower.length > clean.length || lower.length < 3) continue;

      const wordFreq = getFrequency(lower);
      let isValid = true;
      for (const [ch, count] of Object.entries(wordFreq)) {
        if (!targetFreq[ch] || targetFreq[ch] < count) {
          isValid = false;
          break;
        }
      }

      if (isValid && lower !== clean) {
        if (lower.length === clean.length) {
          exactMatches.push(headword);
        } else {
          subMatches.push(headword);
        }
      }
    }

    if (exactMatches.length > 0 || forceExact) {
      return exactMatches.slice(0, max);
    }

    subMatches.sort((a, b) => b.length - a.length || a.localeCompare(b, "tr-TR"));
    return subMatches.slice(0, max);
  }

  /**
   * Finds words in TDK that rhyme with the given word (sharing the same ending suffix/letters).
   * @param word The target word
   * @param options.minLetters Minimum number of ending characters that must match (default: 3)
   * @param options.maxResults Maximum number of rhyme results to return (default: 50)
   */
  public async findRhymes(word: string, options?: RhymeOptions): Promise<string[]> {
    if (!word || word.trim() === "") return [];
    await this.ensureAutocompleteLoaded(options?.signal);

    const clean = word.trim().toLocaleLowerCase("tr-TR");
    const minLetters = Math.min(options?.minLetters ?? 3, clean.length);
    const max = options?.maxResults ?? 50;

    const suffix = clean.slice(-minLetters);
    const results: string[] = [];

    for (const headword of this.headwords.words) {
      const lower = headword.toLocaleLowerCase("tr-TR");
      if (lower !== clean && lower.endsWith(suffix) && !lower.includes(" ")) {
        results.push(headword);
        if (results.length >= max) break;
      }
    }

    return results;
  }

  /**
   * Performs comprehensive spelling, grammar, and syntax proofreading on a Turkish text.
   * Detects:
   * 1. Conjunction 'da/de' erroneously joined to verbs or words (e.g. "gitsende" -> "gitsen de")
   * 2. Conjunction 'ki' erroneously joined to verbs (e.g. "gördümki" -> "gördüm ki"), respecting SOMBAHÇEMİ exceptions
   * 3. Question particle 'mi/mı/mu/mü' erroneously joined to words (e.g. "geldimi" -> "geldi mi")
   * 4. Misspelled words with dictionary suggestions (via edit-distance & morphology)
   */
  public async proofread(text: string, options: RequestOptions = {}): Promise<ProofreadResult> {
    if (!text || text.trim() === "") {
      return { text: text || "", issues: [], isCorrect: true };
    }

    await this.ensureAutocompleteLoaded(options.signal);
    const issues: ProofreadIssue[] = [];

    const SOMBAHCEMI = new Set([
      "sanki", "oysaki", "mademki", "belki", "halbuki", "çünkü", "meğerki", "illaki"
    ]);

    // 1. Detect multi-word phrases that should be written as single compound words
    const PHRASE_MISTAKES: {
      regex: RegExp;
      suggestion: string;
      message: string;
      type: ProofreadIssue["type"];
    }[] = [
      {
        regex: /\bhiç\s+bir\b/gi,
        suggestion: "hiçbir",
        message: "'hiçbir' belgisiz sıfatı bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bbir\s+çok\b/gi,
        suggestion: "birçok",
        message: "'birçok' belgisiz sıfatı/zamiri bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bbir\s+kaç\b/gi,
        suggestion: "birkaç",
        message: "'birkaç' belgisiz sıfatı/zamiri bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bbir\s+az\b/gi,
        suggestion: "biraz",
        message: "'biraz' sözcüğü bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bher\s+hangi\b/gi,
        suggestion: "herhangi",
        message: "'herhangi' sözcüğü bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bgit\s+gide\b/gi,
        suggestion: "gitgide",
        message: "'gitgide' zarfı bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\bbirden\s+bire\b/gi,
        suggestion: "birdenbire",
        message: "'birdenbire' zarfı bitişik yazılmalıdır.",
        type: "spelling",
      },
      {
        regex: /\brast\s+gele\b/gi,
        suggestion: "rastgele",
        message: "'rastgele' zarfı bitişik yazılmalıdır.",
        type: "spelling",
      },
    ];

    const coveredRanges: { start: number; end: number }[] = [];
    for (const pm of PHRASE_MISTAKES) {
      let pmMatch: RegExpExecArray | null;
      while ((pmMatch = pm.regex.exec(text)) !== null) {
        const start = pmMatch.index;
        const end = start + pmMatch[0].length;
        coveredRanges.push({ start, end });
        issues.push({
          type: pm.type,
          word: pmMatch[0],
          startIndex: start,
          endIndex: end,
          suggestion: pm.suggestion,
          message: pm.message,
        });
      }
    }

    const tokenRegex = /[\p{L}0-9'’]+/gu;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(text)) !== null) {
      const rawWord = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + rawWord.length;
      const lower = rawWord.toLocaleLowerCase("tr-TR");

      if (/^\d+$/.test(lower)) continue;
      if (coveredRanges.some((r) => startIndex >= r.start && endIndex <= r.end)) continue;

      let flagged = false;

      // 1. Check Question Particle (mı, mi, mu, mü) erroneously attached
      const questionMatch = lower.match(/^(.+?)(m[ıiuü](?:sin|sın|sun|sün|siniz|sınız|sunuz|sünüz|yiz|yız|yuz|yüz|m|k)?)$/);
      if (questionMatch) {
        const base = questionMatch[1];
        const particle = questionMatch[2];
        if (base.length >= 2 && (await this.isHeadword(base, options) || (await this.findRoot(base, options)) !== null)) {
          if (!(await this.isHeadword(lower, options))) {
            issues.push({
              type: "question_particle",
              word: rawWord,
              startIndex,
              endIndex,
              suggestion: `${base} ${particle}`,
              message: `'${particle}' soru eki kendinden önceki kelimeden ayrı yazılmalıdır.`,
            });
            flagged = true;
          }
        }
      }

      const VERB_CONJUGATION_REGEX =
        /(?:d[ıiuü][kmmn]?|t[ıiuü][kmmn]?|d[ıiuü]n[ıiuü]z?|t[ıiuü]n[ıiuü]z?|m[ıiuü]ş(?:[szn][ıiuü]z?|lar)?|yor(?:um|sun|uz|lar)?|ecek(?:sin|iz|ler)?|acak(?:sın|ız|lar)?|s[ae][mnk]|s[ae]n[ıiz]?|meli|malı|me[mz]|ma[mz])$/i;

      // 2. Check Conjunction 'ki' erroneously attached to verbs
      if (!flagged && lower.endsWith("ki") && lower.length > 3) {
        const base = lower.slice(0, -2);
        if (!SOMBAHCEMI.has(lower)) {
          if (!(await this.isHeadword(lower, options))) {
            const root = await this.findRoot(base, options);
            const isVerb =
              (base === "demek" || base === "kaldı" || base === "yeter" || base === "bilmem" || VERB_CONJUGATION_REGEX.test(base)) &&
              (root ? root.endsWith("mek") || root.endsWith("mak") : true);

            if (isVerb) {
              issues.push({
                type: "conjunction_ki",
                word: rawWord,
                startIndex,
                endIndex,
                suggestion: `${base} ki`,
                message: `'ki' bağlacı ayrı yazılmalıdır.`,
              });
              flagged = true;
            }
          }
        }
      }

      // 3. Check Conjunction 'da/de/ta/te' erroneously attached to verbs
      if (!flagged && (lower.endsWith("de") || lower.endsWith("da") || lower.endsWith("te") || lower.endsWith("ta")) && lower.length > 3) {
        const base = lower.slice(0, -2);
        const ending = lower.slice(-2);
        if (!(await this.isHeadword(lower, options))) {
          const root = await this.findRoot(base, options);
          const isVerb =
            VERB_CONJUGATION_REGEX.test(base) &&
            (root ? root.endsWith("mek") || root.endsWith("mak") : false);

          if (isVerb) {
            const correctEnding = ending.startsWith("t") ? (ending === "te" ? "de" : "da") : ending;
            issues.push({
              type: "conjunction_da",
              word: rawWord,
              startIndex,
              endIndex,
              suggestion: `${base} ${correctEnding}`,
              message: `'da/de' bağlacı fiillerden sonra her zaman ayrı yazılır (bağlaç olan da/de sertleşmez).`,
            });
            flagged = true;
          }
        }
      }

      // 4. Check -şey / -sey erroneously attached to preceding word
      const seyMatch = lower.match(/^(.+?)(?:şey|sey)([ıiuaeüodekmnl]+)?$/);
      if (!flagged && seyMatch && !SEY_EXCEPTIONS.has(lower)) {
        let prefix = seyMatch[1];
        const suffix = seyMatch[2] || "";
        if (prefix === "hicbir") prefix = "hiçbir";
        if (prefix === "cok") prefix = "çok";
        issues.push({
          type: "spelling",
          word: rawWord,
          startIndex,
          endIndex,
          suggestion: `${prefix} şey${suffix}`,
          message: "'şey' sözcüğü kendinden önceki kelimeden ayrı yazılmalıdır.",
        });
        flagged = true;
      }

      // 5. Check 'yada' conjunction mistake
      if (!flagged && lower === "yada") {
        issues.push({
          type: "spelling",
          word: rawWord,
          startIndex,
          endIndex,
          suggestion: "ya da",
          message: "'ya da' bağlacı her zaman ayrı yazılır.",
        });
        flagged = true;
      }

      // 6. Check common vowel drop mistakes: burda, şurda, orda, vb. (TDK Kural 15)
      if (!flagged && (lower === "burda" || lower === "şurda" || lower === "surda" || lower === "orda" || lower === "içerde" || lower === "icerde" || lower === "dışarda" || lower === "disarda" || lower === "yukarda")) {
        const correct = COMMON_MISSPELLINGS[lower] || lower;
        issues.push({
          type: "spelling",
          word: rawWord,
          startIndex,
          endIndex,
          suggestion: correct,
          message: `'${rawWord}' sözcüğünde ünlü düşmesi yapılmaz.`,
        });
        flagged = true;
      }

      // 7. General Spell Check
      if (!flagged) {
        const check = await this.checkSpelling(rawWord, options);
        if (!check.isCorrect) {
          issues.push({
            type: "spelling",
            word: rawWord,
            startIndex,
            endIndex,
            suggestion: check.suggestion,
            message: check.suggestion
              ? `'${rawWord}' yanlış yazılmış olabilir.`
              : `'${rawWord}' sözlükte bulunamadı.`,
          });
        }
      }
    }

    issues.sort((a, b) => a.startIndex - b.startIndex);

    return {
      text,
      issues,
      isCorrect: issues.length === 0,
    };
  }
}

/**
 * Default client used by most code (`TDK.getWord(...)`, `TDK.configure(...)`).
 * Create a separate `new TDKClient(config)` when you need isolated settings/caches.
 */
export const TDK = new TDKClient();
