import type { NodeRepository } from "../repo/NodeRepository.js";
import { toColumnRow, type ColumnRow } from "./getColumn.js";

export function getTrash(repo: NodeRepository): ColumnRow[] {
  return repo
    .getTrashRoots()
    .slice()
    .sort((a, b) => (a.deletedAt! < b.deletedAt! ? 1 : a.deletedAt! > b.deletedAt! ? -1 : 0))
    .map((n) => toColumnRow(repo, n));
}
