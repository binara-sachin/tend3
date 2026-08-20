import { describe, expect, it } from "vitest";
import {
  evenlySpacedKeys,
  firstSortKey,
  isValidSortKey,
  sortKeyAfter,
  sortKeyBetween,
} from "../../lib/sortKey.js";

describe("firstSortKey", () => {
  it("returns a non-empty string", () => {
    expect(firstSortKey().length).toBeGreaterThan(0);
  });
});

describe("sortKeyAfter", () => {
  it("returns a key that sorts after the given key", () => {
    const first = firstSortKey();
    const second = sortKeyAfter(first);

    expect(second > first).toBe(true);
  });

  it("returns a key that continues to sort after repeated appends", () => {
    let key = firstSortKey();
    for (let i = 0; i < 5; i++) {
      const next = sortKeyAfter(key);
      expect(next > key).toBe(true);
      key = next;
    }
  });
});

describe("sortKeyBetween", () => {
  it("returns a key that sorts strictly between two existing keys", () => {
    const a = firstSortKey();
    const b = sortKeyAfter(a);

    const middle = sortKeyBetween(a, b);

    expect(middle > a).toBe(true);
    expect(middle < b).toBe(true);
  });
});

describe("isValidSortKey", () => {
  it("accepts keys produced by firstSortKey/sortKeyAfter", () => {
    expect(isValidSortKey(firstSortKey())).toBe(true);
    expect(isValidSortKey(sortKeyAfter(firstSortKey()))).toBe(true);
  });

  it("rejects a malformed key such as a raw epoch-timestamp string", () => {
    expect(isValidSortKey("z1787202573623")).toBe(false);
  });
});

describe("evenlySpacedKeys", () => {
  it("returns N keys in ascending order", () => {
    const keys = evenlySpacedKeys(5);

    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it("returns an empty array for zero", () => {
    expect(evenlySpacedKeys(0)).toEqual([]);
  });

  it("returns a single key for one", () => {
    expect(evenlySpacedKeys(1)).toHaveLength(1);
  });
});
