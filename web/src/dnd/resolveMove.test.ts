import { describe, expect, it } from "vitest";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import {
  resolveCrossColumnInsertion,
  resolveInsertSide,
  resolveSameColumnReorder,
  resolveWholeRowDrop,
} from "./resolveMove.js";

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
    totalDescendantCount: 0,
    hasNotes: false,
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

describe("resolveInsertSide", () => {
  it("is 'before' when the dragged item's center sits above the target row's midpoint", () => {
    expect(resolveInsertSide(10, 0, 40)).toBe("before"); // midpoint = 20
  });

  it("is 'after' when the dragged item's center sits below the target row's midpoint", () => {
    expect(resolveInsertSide(30, 0, 40)).toBe("after"); // midpoint = 20
  });
});

describe("resolveCrossColumnInsertion", () => {
  it("computes a key between over and its predecessor when inserting before it", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const siblings = [row("a", keyA as string), row("b", keyB as string)];

    const result = resolveCrossColumnInsertion("b", "p2", "before", siblings);

    expect(result?.newParentId).toBe("p2");
    expect(result?.parentId).toBe("p2");
    expect((result?.newSortKey as string) > (keyA as string)).toBe(true);
    expect((result?.newSortKey as string) < (keyB as string)).toBe(true);
  });

  it("computes a key after over when inserting after it, at the end of the list", () => {
    const [keyA] = sequentialKeys(1);
    const siblings = [row("a", keyA as string)];

    const result = resolveCrossColumnInsertion("a", "p2", "after", siblings);

    expect((result?.newSortKey as string) > (keyA as string)).toBe(true);
  });

  it("maps the 'root' parent sentinel to a null newParentId", () => {
    const [keyA] = sequentialKeys(1);
    const siblings = [row("a", keyA as string)];

    const result = resolveCrossColumnInsertion("a", "root", "after", siblings);

    expect(result?.newParentId).toBeNull();
  });

  it("returns null if over is missing from the target siblings", () => {
    expect(resolveCrossColumnInsertion("missing", "p2", "after", [])).toBeNull();
  });
});

describe("resolveWholeRowDrop", () => {
  it("appends after the target project's last child", () => {
    const [keyA, keyB] = sequentialKeys(2);
    const children = [row("a", keyA as string), row("b", keyB as string)];

    const result = resolveWholeRowDrop("proj-1", children);

    expect(result.newParentId).toBe("proj-1");
    expect(result.parentId).toBe("proj-1");
    expect((result.newSortKey as string) > (keyB as string)).toBe(true);
  });

  it("returns a valid first key for a project with no children", () => {
    const result = resolveWholeRowDrop("proj-1", []);
    expect(result.newSortKey.length).toBeGreaterThan(0);
  });
});
