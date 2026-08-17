import type { NodeRepository } from "../repo/NodeRepository.js";

export interface CountMismatch {
  nodeId: string;
  stored: number;
  expected: number;
}

export function verifyCounts(repo: NodeRepository): CountMismatch[] {
  const expected = repo.recomputeOpenDescendantCounts();
  const mismatches: CountMismatch[] = [];

  for (const [nodeId, expectedCount] of expected) {
    const stored = repo.getById(nodeId)?.openDescendantCount ?? -1;
    if (stored !== expectedCount) {
      mismatches.push({ nodeId, stored, expected: expectedCount });
    }
  }

  for (const row of repo.getNonProjectRowsWithNonzeroCount()) {
    mismatches.push({ nodeId: row.id, stored: row.openDescendantCount, expected: 0 });
  }

  return mismatches;
}
