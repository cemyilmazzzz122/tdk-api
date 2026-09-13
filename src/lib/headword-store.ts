import { buildPrefixIndex, searchPrefix, type PrefixIndex } from "./prefix-index";

/**
 * In-memory copy of TDK's ~81k headword list with its lazily built prefix
 * indexes. The list is public dictionary data rather than per-user state, so
 * every client shares one store instead of each downloading its own copy.
 */
export class HeadwordStore {
  words: string[] = [];
  set = new Set<string>();
  private index: PrefixIndex | null = null;
  private foldedIndex: PrefixIndex | null = null;
  private load: Promise<void> | null = null;
  private generation = 0;

  get loaded(): boolean {
    return this.words.length > 0;
  }

  /**
   * Loads the list once via `loader`. Concurrent callers share one in-flight
   * load; an empty result is not kept, so the next call retries. A `clear()`
   * during a load bumps the generation, so the stale load can't refill it.
   */
  ensure(loader: () => Promise<string[]>): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.load) {
      const generation = this.generation;
      this.load = loader()
        .then((words) => {
          if (generation !== this.generation) return;
          this.words = words;
          this.set = new Set(words.map((w) => w.toLocaleLowerCase("tr-TR")));
          this.index = null;
          this.foldedIndex = null;
        })
        .finally(() => {
          if (generation === this.generation) this.load = null;
        });
    }
    return this.load;
  }

  clear(): void {
    this.words = [];
    this.set = new Set();
    this.index = null;
    this.foldedIndex = null;
    this.load = null;
    this.generation++;
  }

  /**
   * Exact-prefix matches first; with `foldDiacritics`, fills the remaining
   * slots with matches that only differ in Turkish letters/circumflexes
   * ("kagit" → "kâğıt"). The folded index is built on first such search.
   */
  search(prefix: string, limit: number, foldDiacritics = false): string[] {
    if (!this.loaded) return [];
    this.index ??= buildPrefixIndex(this.words);
    const exact = searchPrefix(this.index, prefix, limit);
    if (!foldDiacritics || exact.length >= limit) return exact;

    this.foldedIndex ??= buildPrefixIndex(this.words, { foldDiacritics: true });
    const seen = new Set(exact);
    for (const word of searchPrefix(this.foldedIndex, prefix, limit + exact.length)) {
      if (exact.length >= limit) break;
      if (!seen.has(word)) {
        seen.add(word);
        exact.push(word);
      }
    }
    return exact;
  }
}
