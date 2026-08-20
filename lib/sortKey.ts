import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export function firstSortKey(): string {
  return generateKeyBetween(null, null);
}

export function sortKeyAfter(prevKey: string | null): string {
  return generateKeyBetween(prevKey, null);
}

export function sortKeyBetween(
  prevKey: string | null,
  nextKey: string | null,
): string {
  return generateKeyBetween(prevKey, nextKey);
}

/** True iff `key` is a well-formed fractional-indexing order key. */
export function isValidSortKey(key: string): boolean {
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/** N evenly-spaced keys, ascending — used by Rebalance to renumber a parent's children. */
export function evenlySpacedKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}
