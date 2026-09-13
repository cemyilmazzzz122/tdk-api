/**
 * Turkish alphabet order (q/w/x slotted in Latin order). Each letter is mapped
 * to a private use code point so plain code-unit string comparison sorts in
 * this order, while spaces, digits and punctuation keep their low code points
 * and sort before any letter ("kaba but" < "kabaca"). Circumflexed vowels
 * share their plain vowel's rank, matching TDK's own list order
 * ("agâh" < "agami", "adedî" < "adedimürettep").
 */
const TURKISH_ALPHABET = "abcçdefgğhıijklmnoöpqrsştuüvwxyz";
const LETTER_RANK = new Map(
  [...TURKISH_ALPHABET].map((ch, i) => [ch, String.fromCharCode(0xe000 + i)] as const)
);
for (const [circumflex, plain] of [["â", "a"], ["î", "i"], ["û", "u"]] as const) {
  LETTER_RANK.set(circumflex, LETTER_RANK.get(plain)!);
}

/**
 * Builds a sort key for Turkish text. The mapping is character-by-character,
 * so the key of a prefix is always a prefix of the key — every word starting
 * with a given prefix lies in one contiguous block of a key-sorted array.
 */
export function turkishSortKey(text: string): string {
  let key = "";
  for (const ch of text.toLocaleLowerCase("tr-TR")) key += LETTER_RANK.get(ch) ?? ch;
  return key;
}

export interface PrefixIndex {
  keys: string[];
  lowers: string[];
  words: string[];
}

/**
 * Stably sorts a word list by `turkishSortKey` into parallel arrays; words
 * with equal keys keep their input order.
 */
export function buildPrefixIndex(words: readonly string[]): PrefixIndex {
  const entries = words.map((word) => ({ word, key: turkishSortKey(word) }));
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    keys: entries.map((e) => e.key),
    lowers: entries.map((e) => e.word.toLocaleLowerCase("tr-TR")),
    words: entries.map((e) => e.word),
  };
}

/**
 * Returns up to `limit` words starting with `prefix` (case-insensitive,
 * Turkish casing rules; circumflexes must match exactly), in Turkish
 * alphabetical order. Binary-searches the start of the matching key block,
 * then walks it: O(log n + block size).
 */
export function searchPrefix(index: PrefixIndex, prefix: string, limit: number): string[] {
  const lower = prefix.trim().toLocaleLowerCase("tr-TR");
  const p = turkishSortKey(lower);
  if (!p || limit <= 0) return [];

  let low = 0;
  let high = index.keys.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index.keys[mid] < p) low = mid + 1;
    else high = mid;
  }

  const results: string[] = [];
  const seen = new Set<string>();
  for (let i = low; i < index.keys.length && results.length < limit; i++) {
    if (!index.keys[i].startsWith(p)) break;
    const word = index.words[i];
    if (index.lowers[i].startsWith(lower) && !seen.has(word)) {
      seen.add(word);
      results.push(word);
    }
  }
  return results;
}
