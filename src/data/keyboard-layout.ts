/**
 * Turkish Q (QWERTY) keyboard geometry for the spell checker's closest-headword
 * fallback. Plain Damerau-Levenshtein treats every wrong letter as one full
 * edit, so it cannot tell that "arabs" is much more likely a slip for "araba"
 * (s and a sit next to each other) than for some equidistant headword, or that
 * "swlam" is "selam" (w next to e). These tables let a substitution cost a
 * fraction of an edit when the two keys are physically adjacent — or are the
 * ASCII/diacritic pair of one another (ı/i, ş/s, ö/o, …), the other dominant
 * class of Turkish typo — so the nearest *and* most plausible headword wins.
 * Everyone is assumed to be on a Turkish Q layout.
 */
const KEYBOARD_ROWS: ReadonlyArray<readonly [string, number]> = [
  ["qwertyuıopğü", 0],
  ["asdfghjklşi", 0.5],
  ["zxcvbnmöç", 1],
];

const KEYBOARD_COORDS: Readonly<Record<string, readonly [number, number]>> = (() => {
  const coords: Record<string, readonly [number, number]> = {};
  KEYBOARD_ROWS.forEach(([keys, offset], row) => {
    [...keys].forEach((key, col) => {
      coords[key] = [col + offset, row];
    });
  });
  return coords;
})();

/** ASCII <-> Turkish-diacritic siblings, treated as an almost-free substitution. */
export const DIACRITIC_SIBLINGS: Readonly<Record<string, string>> = {
  ı: "i", i: "ı", ö: "o", o: "ö", ü: "u", u: "ü",
  ş: "s", s: "ş", ç: "c", c: "ç", ğ: "g", g: "ğ", â: "a", a: "â",
};

/** Cost of substituting a key for its left/right neighbour on the same row. */
export const KEYBOARD_ROW_SUB_COST = 0.4;
/** Cost of substituting a key for a diagonally adjacent one on the row above/below. */
export const KEYBOARD_DIAGONAL_SUB_COST = 0.55;
/** Cost of confusing a letter with its diacritic/ASCII sibling. */
export const DIACRITIC_SUB_COST = 0.3;
/** Cost of a transposition ("selam" <-> "selma"): a single wrong finger order. */
export const TRANSPOSITION_COST = 0.8;

/**
 * Weighted substitution cost between two single characters: 0 if identical,
 * a small fraction if they are diacritic siblings or neighbouring keys on a
 * Turkish Q keyboard, otherwise a full 1.
 */
export function keyboardSubCost(a: string, b: string): number {
  if (a === b) return 0;
  if (DIACRITIC_SIBLINGS[a] === b) return DIACRITIC_SUB_COST;
  const pa = KEYBOARD_COORDS[a];
  const pb = KEYBOARD_COORDS[b];
  if (!pa || !pb) return 1;
  const dx = Math.abs(pa[0] - pb[0]);
  const dy = Math.abs(pa[1] - pb[1]);
  // Same row, immediate horizontal neighbour: the most common slip.
  if (dy === 0 && dx <= 1 + 1e-9) return KEYBOARD_ROW_SUB_COST;
  // One row up/down and within roughly one key horizontally: a diagonal slip.
  if (dy === 1 && dx <= 1 + 1e-9) return KEYBOARD_DIAGONAL_SUB_COST;
  return 1;
}
