import type { WordInfo, DailyContent, SpellCheckResult, WordOfTheDay, DailyPick } from "./types";
import { TDKValidationError, TDKNetworkError } from "./errors";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";

/**
 * TDK (Türk Dil Kurumu) API Wrapper
 */
export class TDK {
  private static readonly BASE_URL = "https://sozluk.gov.tr";
  private static readonly AUDIO_API_HOST = "api.sozluk.gov.tr";

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
   * Returns suggestions (autocomplete) for a given prefix.
   */
  public static async getSuggestions(prefix: string): Promise<string[]> {
    if (this.autocompleteCache.length === 0) {
      try {
        const response = await fetch(`${this.BASE_URL}/autocomplete.json`, {
          headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
        });
        if (response.ok) {
          const data = await response.json() as { madde: string }[];
          this.autocompleteCache = data.map(item => item.madde);
        }
      } catch (e) {
        return [];
      }
    }
    
    const cleanPrefix = prefix.toLocaleLowerCase("tr-TR");
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
   * Looks up the internal audio id ("seskod") for a word via the same
   * `api.sozluk.gov.tr/gts-yeni` endpoint the official web UI calls to build
   * its pronunciation button. That endpoint 403s unless the request looks
   * like it came from a browser tab on sozluk.gov.tr: it needs an
   * `Origin`/`Referer` pair matching that site AND a browser-like
   * `User-Agent` (our usual `TDK-API-Nodejs-Wrapper/…` UA gets rejected).
   * `fetch` (undici) also strips a manually-set `Origin` header as a
   * forbidden header name, so this uses `node:https` directly instead.
   * This is inherently fragile scraping of an undocumented endpoint — if
   * TDK tightens this check further, this should fail closed to `null`
   * (already does) rather than throw.
   */
  private static fetchSeskod(word: string): Promise<string | null> {
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
              const seskod = Array.isArray(data) ? data[0]?.seskod : undefined;
              resolve(seskod ? String(seskod) : null);
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
    
    // 2. If not, check "sıkça yapılan yanlışlar" from DailyContent
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
    return { isCorrect: false, word };
  }

  /**
   * Fetches daily content (word of the day, proverbs, rules, etc).
   */
  public static async getDailyContent(): Promise<DailyContent | null> {
    if (this.isCacheEnabled && this.dailyContentCache) return this.dailyContentCache;
    
    try {
      const response = await fetch(`${this.BASE_URL}/icerik`, {
        headers: { "User-Agent": "TDK-API-Nodejs-Wrapper/1.0" },
      });
      if (response.ok) {
        const data = await response.json() as DailyContent;
        if (this.isCacheEnabled) this.dailyContentCache = data;
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
