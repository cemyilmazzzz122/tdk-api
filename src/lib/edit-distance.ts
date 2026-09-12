import { keyboardSubCost, TRANSPOSITION_COST } from "../data/keyboard-layout";

/**
 * Damerau-Levenshtein edit-distance (optimal string alignment variant):
 * like classic Levenshtein but also counts an adjacent-character
 * transposition (e.g. "yanlız" -> "yalnız") as a single edit instead of
 * two substitutions — a very common class of typo that plain Levenshtein
 * otherwise misses.
 */
export function damerauLevenshtein(a: string, b: string): number {
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
 * Keyboard- and diacritic-aware edit distance: same optimal-string-alignment
 * recurrence as {@link damerauLevenshtein}, but a substitution is charged by
 * {@link keyboardSubCost} (a fraction of an edit when the two letters are
 * adjacent on a Turkish Q keyboard or are ASCII/diacritic siblings) and a
 * transposition costs {@link TRANSPOSITION_COST}. Insertions and deletions
 * still cost a full 1. Used only to *rank* spelling candidates; the plain
 * integer distance still gates whether a suggestion is offered at all.
 */
export function keyboardAwareDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = keyboardSubCost(a[i - 1], b[j - 1]);
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + TRANSPOSITION_COST);
      }
    }
  }
  return dp[a.length][b.length];
}
