import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeType } from "../repo/types.js";

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
}

export function getColumn(repo: NodeRepository, parentId: string | null): ColumnRow[] {
  return repo
    .getChildren(parentId)
    .filter((n) => n.deletedAt === null)
    .map((n) => ({
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
    }));
}
