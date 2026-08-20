import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeRow, NodeType } from "../repo/types.js";

export interface ColumnRow {
  id: string;
  type: NodeType;
  title: string;
  sortKey: string;
  isSystem: boolean;
  whenDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  isComplete: boolean | null;
  openDescendantCount: number;
  /** Live todo descendants of this node, any completion state — 0 for non-project rows. Powers the project progress indicator; not incrementally maintained like openDescendantCount. */
  totalDescendantCount: number;
  hasNotes: boolean;
}

export function toColumnRow(repo: NodeRepository, n: NodeRow): ColumnRow {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    sortKey: n.sortKey,
    isSystem: n.isSystem,
    whenDate: n.whenDate,
    deadline: n.deadline,
    completedAt: n.completedAt,
    isComplete:
      n.type === "project" ? n.openDescendantCount === 0 && repo.hasLiveDescendant(n.id) : null,
    openDescendantCount: n.openDescendantCount,
    totalDescendantCount: n.type === "project" ? repo.countLiveDescendantTodosInSubtree(n.id) : 0,
    hasNotes: n.notes.trim().length > 0,
  };
}

export function getColumn(repo: NodeRepository, parentId: string | null): ColumnRow[] {
  return repo
    .getChildren(parentId)
    .filter((n) => n.deletedAt === null)
    .map((n) => toColumnRow(repo, n));
}
