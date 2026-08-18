import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeType } from "../repo/types.js";
import { hasTrashedAncestor } from "./ancestryFilters.js";

export interface SearchResult {
  id: string;
  type: NodeType;
  title: string;
  notes: string;
  /** Nearest ancestor first, root last. */
  path: Array<{ id: string; type: NodeType }>;
}

export function getSearchResults(repo: NodeRepository, query: string): SearchResult[] {
  return repo
    .searchCandidates(query)
    .filter((n) => n.deletedAt === null && !hasTrashedAncestor(repo, n.id))
    .map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      notes: n.notes,
      path: repo
        .getAncestorIds(n.id)
        .map((ancestorId) => repo.getById(ancestorId))
        .filter((ancestor) => ancestor !== null)
        .map((ancestor) => ({ id: ancestor.id, type: ancestor.type })),
    }));
}
