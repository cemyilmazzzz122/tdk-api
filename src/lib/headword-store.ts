import { buildPrefixIndex, searchPrefix, type PrefixIndex } from "./prefix-index";

/**
 * In-memory copy of TDK's ~81k headword list with its lazily built prefix
 * index. The list is public dictionary data rather than per-user state, so
 * every client shares one store instead of each downloading its own copy.
 */
export class HeadwordStore {
  words: string[] = [];
  set = new Set<string>();
  private index: PrefixIndex | null = null;
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
    this.load = null;
    this.generation++;
  }

  search(prefix: string, limit: number): string[] {
    if (!this.loaded) return [];
    this.index ??= buildPrefixIndex(this.words);
    return searchPrefix(this.index, prefix, limit);
  }
}
