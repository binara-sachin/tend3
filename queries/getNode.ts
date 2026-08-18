import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeType } from "../repo/types.js";

export interface NodeDetail {
  id: string;
  type: NodeType;
  title: string;
  notes: string;
  whenDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  /** Nearest ancestor first, root last. */
  path: Array<{ id: string; type: NodeType; title: string }>;
}

export function getNode(repo: NodeRepository, id: string): NodeDetail | null {
  const node = repo.getById(id);
  if (!node) return null;

  return {
    id: node.id,
    type: node.type,
    title: node.title,
    notes: node.notes,
    whenDate: node.whenDate,
    deadline: node.deadline,
    completedAt: node.completedAt,
    path: repo
      .getAncestorIds(node.id)
      .map((ancestorId) => repo.getById(ancestorId))
      .filter((ancestor) => ancestor !== null)
      .map((ancestor) => ({ id: ancestor.id, type: ancestor.type, title: ancestor.title })),
  };
}
