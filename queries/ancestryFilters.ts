import type { NodeRepository } from "../repo/NodeRepository.js";

/** True if any ancestor of `id` (excluding `id` itself) has been trashed. */
export function hasTrashedAncestor(repo: NodeRepository, id: string): boolean {
  return repo.getAncestorIds(id).some((ancestorId) => repo.getById(ancestorId)?.deletedAt !== null);
}
