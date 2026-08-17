import { generateId } from "../../lib/id.js";
import { firstSortKey, sortKeyAfter } from "../../lib/sortKey.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import type { NodeRow } from "../../repo/types.js";
import type { TreeNode } from "./buildTree.js";

/** Inserts a generated forest into the repo, returning every inserted row flat. */
export function seedForest(
  repo: NodeRepository,
  forest: TreeNode[],
  now: string,
): NodeRow[] {
  const inserted: NodeRow[] = [];

  function insertSiblings(nodes: TreeNode[], parentId: string | null): void {
    let sortKey: string | null = null;
    for (const node of nodes) {
      sortKey = sortKey === null ? firstSortKey() : sortKeyAfter(sortKey);
      const id = generateId();
      repo.insert({
        id,
        parentId,
        type: node.type,
        title: node.title,
        notes: "",
        sortKey,
        whenDate: null,
        deadline: null,
        createdAt: now,
        updatedAt: now,
      });
      const row = repo.getById(id);
      if (row) inserted.push(row);
      if (node.type !== "todo") {
        insertSiblings(node.children, id);
      }
    }
  }

  insertSiblings(forest, null);

  // Direct inserts bypass the command layer, so open_descendant_count starts
  // at its column default (0) on every row. Bring it in line with what a real
  // sequence of commands would have maintained, so the seeded tree is a valid
  // starting fixture rather than one verifyCounts would immediately flag.
  for (const [nodeId, count] of repo.recomputeOpenDescendantCounts()) {
    if (count !== 0) repo.adjustOpenDescendantCount([nodeId], count);
  }

  return inserted;
}
