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

/** N evenly-spaced keys, ascending — used by Rebalance to renumber a parent's children. */
export function evenlySpacedKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}
