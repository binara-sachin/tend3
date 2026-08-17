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
  };
}
