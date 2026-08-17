import type { NewNodeInput, NodeRow } from "./types.js";

export interface NodeRepository {
  transaction<T>(fn: () => T): T;

  insert(input: NewNodeInput): void;
  getById(id: string): NodeRow | null;
  getChildren(parentId: string | null): NodeRow[];
  hardDelete(id: string): void;
  /** Permanently deletes rootId and its entire subtree, any depth, regardless of each node's own deleted_at. */
  hardDeleteSubtree(rootId: string): void;
  /** Trashed nodes with no trashed ancestor — the roots EmptyTrash purges (spec 4). */
  getTrashRoots(): NodeRow[];

  updateParentAndSortKey(
    id: string,
    parentId: string | null,
    sortKey: string,
    updatedAt: string,
  ): void;
  updateTitle(id: string, title: string, updatedAt: string): void;
  updateNotes(id: string, notes: string, updatedAt: string): void;
  updateWhenDate(id: string, whenDate: string | null, updatedAt: string): void;
  updateDeadline(id: string, deadline: string | null, updatedAt: string): void;
  updateCompletedAt(
    id: string,
    completedAt: string | null,
    updatedAt: string,
  ): void;
  updateDeletedAt(
    id: string,
    deletedAt: string | null,
    updatedAt: string,
  ): void;

  /** Ancestor ids of `id`, any type, excluding `id` itself. */
  getAncestorIds(id: string): string[];
  /** Ancestor ids of `id` that are type 'project', excluding `id` itself. */
  getAncestorProjectIds(id: string): string[];
  /** True if `candidateId` is a descendant of `ancestorId` at any depth. */
  isDescendantOf(candidateId: string, ancestorId: string): boolean;

  adjustOpenDescendantCount(ids: string[], delta: number): void;
  /**
   * Count of live (own deleted_at IS NULL, no deleted_at-set node between
   * rootId and it), incomplete todo descendants of rootId, excluding rootId.
   */
  countLiveOpenTodosInSubtree(rootId: string): number;
  /** Recomputes open_descendant_count from scratch for every project node. */
  recomputeOpenDescendantCounts(): Map<string, number>;
  /** Non-project rows with a nonzero open_descendant_count — always a bug, since only projects use it. */
  getNonProjectRowsWithNonzeroCount(): NodeRow[];
  /** True if any live (deleted_at IS NULL) node exists anywhere beneath id, any type, any completion state. */
  hasLiveDescendant(id: string): boolean;
}
