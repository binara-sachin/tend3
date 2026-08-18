import type { NodeRepository } from "../repo/NodeRepository.js";
import { toColumnRow, type ColumnRow } from "./getColumn.js";

export interface TrashRow extends ColumnRow {
  deletedAt: string;
}

export function getTrash(repo: NodeRepository): TrashRow[] {
  return repo
    .getTrashRoots()
    .slice()
    .sort((a, b) => (a.deletedAt! < b.deletedAt! ? 1 : a.deletedAt! > b.deletedAt! ? -1 : 0))
    .map((n) => ({ ...toColumnRow(repo, n), deletedAt: n.deletedAt! }));
}
