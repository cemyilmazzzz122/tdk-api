import type { TDKError } from "./errors";

export interface Author {
  yazar_id: string;
  tam_adi: string;
  kisa_adi: string;
  ekno: string;
}

export interface Example {
  ornek_id: string;
  anlam_id: string;
  ornek_sira: string;
  ornek: string;
  kac: string;
  yazar_id: string;
  yazar_vd: string;
  yazar?: Author[];
}

export interface Feature {
  ozellik_id: string;
  tur: string;
  tam_adi: string;
  kisa_adi: string;
  ekno: string;
}

export interface Meaning {
  anlam_id: string;
  madde_id: string;
  anlam_sira: string;
  fiil: string;
  tipkes: string;
  anlam: string;
  anlam_html: string | null;
  gos: string;
  gos_kelime: string;
  gos_kultur: string;
  orneklerListe?: Example[];
  ozelliklerListe?: Feature[];
}

export interface Proverb {
  madde_id: string;
  madde: string;
  on_taki: string | null;
}

export interface WordInfo {
  madde_id: string;
  kac: string;
  kelime_no: string;
  cesit: string;
  anlam_gor: string;
  on_taki: string | null;
  on_taki_html: string | null;
  madde: string;
  madde_html: string | null;
  cesit_say: string;
  anlam_say: string;
  taki: string;
  cogul_mu: string;
  ozel_mi: string;
  egik_mi: string;
  lisan_kodu: string;
  lisan: string;
  telaffuz_html: string | null;
  telaffuz: string;
  birlesikler: string | null;
  font: string | null;
  madde_duz: string;
  gosterim_tarihi: string | null;
  anlamlarListe?: Meaning[];
  atasozu?: Proverb[];
}

export interface DailyContent {
  kelime: { madde: string; anlam: string }[];
  atasoz: { madde: string; anlam: string }[];
  kural: { adi: string; url: string }[];
  syyd: { id: string; yanliskelime: string; dogrukelime: string }[];
  karistirma: { id: string; yanlis: string; dogru: string }[];
}

export interface SpellCheckResult {
  isCorrect: boolean;
  word: string;
  suggestion?: string;
  isInflected?: boolean;
  root?: string;
}

export interface StemResult {
  word: string;
  root: string;
  isInflected: boolean;
  candidates?: string[];
}

export interface WordOfTheDay {
  word: string;
  meanings: string[];
}

export interface DailyPick {
  type: "kelime" | "atasoz";
  madde: string;
  anlam: string;
}

export interface TDKRule {
  adi: string;
  url: string;
}

export interface WordComparisonSide {
  word: string;
  meaningCount: number;
  origin: string | null;
  syllables: string[];
  harmony: boolean;
  labialHarmony?: boolean;
}

export interface WordComparison {
  a: WordComparisonSide;
  b: WordComparisonSide;
}

export interface WordAnalysis {
  word: string;
  found: boolean;
  meaning: string | null;
  origin: string | null;
  root?: string;
  isInflected?: boolean;
}

export interface ProofreadIssue {
  type: "spelling" | "conjunction_da" | "conjunction_ki" | "question_particle";
  word: string;
  startIndex: number;
  endIndex: number;
  suggestion?: string;
  message: string;
}

export interface ProofreadResult {
  text: string;
  issues: ProofreadIssue[];
  isCorrect: boolean;
}

/** Per-call options accepted by every method that may hit the network. */
export interface RequestOptions {
  /**
   * Cancels the call: pending requests are aborted and the returned promise
   * rejects with the signal's reason (e.g. an `AbortError`), even for methods
   * that otherwise return `null`/`[]` on failure.
   */
  signal?: AbortSignal;
}

export interface PatternSearchOptions extends RequestOptions {
  maxResults?: number;
}

export interface AnagramOptions extends RequestOptions {
  exactLength?: boolean;
  maxResults?: number;
}

export interface RhymeOptions extends RequestOptions {
  minLetters?: number;
  maxResults?: number;
}

export interface TDKConfig {
  timeoutMs?: number;
  retries?: number;
  cache?: boolean;
  maxCacheSize?: number;
  /**
   * Maximum parallel TDK requests for batch methods (`getWordsBatch`,
   * `analyzeText`, `groupByOrigin`). Default: 4.
   */
  concurrency?: number;
  /**
   * Makes methods that normally degrade to `null`/`[]` on failure throw instead
   * (`TDKNetworkError` for request/HTTP failures, `TDKParseError` when a source's
   * content no longer matches what the scraper expects), so "not found" and
   * "source unreachable" can be told apart. "Not found" still returns
   * `null`/`[]`. Default: false.
   */
  strict?: boolean;
  /**
   * Called with every failure a non-strict client swallows (and with a stale
   * disk copy fallback). Setting the `TDK_DEBUG` environment variable also
   * logs them to stderr.
   */
  onError?: (error: TDKError) => void;
  /**
   * Persists TDK's ~81k headword list to disk so later processes start with
   * instant local autocomplete instead of re-downloading it (default: false).
   */
  diskCache?: boolean;
  /**
   * Directory for the headword disk cache (default: `$XDG_CACHE_HOME/tdk-api-wrapper`,
   * `~/.cache/tdk-api-wrapper`, or `%LOCALAPPDATA%\tdk-api-wrapper` on Windows).
   */
  diskCacheDir?: string;
}

export interface KubbealtiEntry {
  kelime: string;
  anlam: string;
}

export interface WiktionaryEntry {
  raw: string;
  sections: Record<string, string>;
}

export type TDKResponse = WordInfo[] | { error: string };

