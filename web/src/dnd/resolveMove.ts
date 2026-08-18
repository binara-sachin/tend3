import { arrayMove } from "@dnd-kit/sortable";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { sortKeyAfter, sortKeyBetween } from "../../../lib/sortKey.js";

export interface ResolvedMove {
  nodeId: string;
  newParentId: string | null;
  newSortKey: string;
  /** The parentId (using the "root" sentinel where applicable) to invalidate. */
  parentId: string;
}

/**
 * Pure drag-resolution logic, deliberately kept out of the React component
 * and out of dnd-kit's sensors entirely: jsdom has no real layout engine
 * (every element reports a zero-size rect), so dnd-kit's keyboard sensor
 * can't be exercised meaningfully in an RTL/jsdom test — spec 8 anticipates
 * that testing "under Playwright" (a real browser) for exactly this reason.
 * This function is what actually needs unit coverage; the DOM wiring is
 * verified against a real browser instead (see the Phase 3 progress notes).
 */
export function resolveSameColumnReorder(
  activeId: string,
  overId: string,
  activeParentId: string,
  overParentId: string,
  siblings: ColumnRow[],
): ResolvedMove | null {
  if (activeId === overId) return null;
  if (activeParentId !== overParentId) return null;

  const oldIndex = siblings.findIndex((r) => r.id === activeId);
  const overIndex = siblings.findIndex((r) => r.id === overId);
  if (oldIndex === -1 || overIndex === -1) return null;

  const reordered = arrayMove(siblings, oldIndex, overIndex);
  const newIndex = reordered.findIndex((r) => r.id === activeId);
  const prevKey = reordered[newIndex - 1]?.sortKey ?? null;
  const nextKey = reordered[newIndex + 1]?.sortKey ?? null;
  const newSortKey = nextKey !== null ? sortKeyBetween(prevKey, nextKey) : sortKeyAfter(prevKey);

  return {
    nodeId: activeId,
    newParentId: overParentId === "root" ? null : overParentId,
    newSortKey,
    parentId: overParentId,
  };
}
