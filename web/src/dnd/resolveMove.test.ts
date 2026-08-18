import { describe, expect, it } from "vitest";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { resolveSameColumnReorder } from "./resolveMove.js";

function row(id: string, sortKey: string): ColumnRow {
  return {
    id,
    type: "todo",
    title: id,
    sortKey,
    isSystem: false,
    whenDate: null,
    deadline: null,
    completedAt: null,
    isComplete: null,
    openDescendantCount: 0,
  };
}

/** N real, validly-encoded fractional-index keys in ascending order. */
function sequentialKeys(count: number): string[] {
  const keys = [firstSortKey()];
  while (keys.length < count) {
    keys.push(sortKeyAfter(keys[keys.length - 1] as string));
  }
  return keys;
}

describe("resolveSameColumnReorder", () => {
  it("returns null when dropped on itself", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];
    expect(resolveSameColumnReorder("a", "a", "p1", "p1", siblings)).toBeNull();
  });

  it("returns null when active and over belong to different parents", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];
    expect(resolveSameColumnReorder("a", "b", "p1", "p2", siblings)).toBeNull();
  });

  it("moving the first item past the second computes a key after the second", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];

    const result = resolveSameColumnReorder("a", "b", "p1", "p1", siblings);

    expect(result?.nodeId).toBe("a");
    expect(result?.newParentId).toBe("p1");
    expect((result?.newSortKey as string) > (keyB as string)).toBe(true);
  });

  it("moving the last item before the first computes a key before the first", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];

    const result = resolveSameColumnReorder("b", "a", "p1", "p1", siblings);

    expect((result?.newSortKey as string) < (keyA as string)).toBe(true);
  });

  it("moving into the middle of a three-item list computes a key strictly between its new neighbors", () => {
    const [keyA, keyB, keyC] = sequentialKeys(3);
    const siblings = [row("a", keyA as string), row("b", keyB as string), row("c", keyC as string)];

    // Move "c" to land on "a" (i.e. become the new first item, pushing a to
    // second): arrayMove(siblings, 2, 0) -> [c, a, b], so the new sort key
    // for c must sort before keyA with nothing before it in this direction.
    const result = resolveSameColumnReorder("c", "a", "p1", "p1", siblings);

    expect((result?.newSortKey as string) < (keyA as string)).toBe(true);
  });

  it("maps the 'root' parent sentinel to a null newParentId", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];

    const result = resolveSameColumnReorder("a", "b", "root", "root", siblings);

    expect(result?.newParentId).toBeNull();
  });

  it("returns null if either id is missing from the siblings list", () => {
    const siblings = [row("a", firstSortKey())];
    expect(resolveSameColumnReorder("a", "missing", "p1", "p1", siblings)).toBeNull();
  });
});
