import { generateKeyBetween } from "fractional-indexing";

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
