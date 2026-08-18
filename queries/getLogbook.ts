import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeRow } from "../repo/types.js";
import { hasTrashedAncestor } from "./ancestryFilters.js";
import { toColumnRow, type ColumnRow } from "./getColumn.js";

export interface LogbookGroup {
  day: string;
  rows: ColumnRow[];
}

function calendarDay(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export function getLogbook(repo: NodeRepository): LogbookGroup[] {
  const completedTodos = repo
    .getCompletedTodos()
    .filter((n) => !hasTrashedAncestor(repo, n.id))
    .map((n) => ({ day: calendarDay(n.completedAt!), node: n }));

  const completeProjects = repo
    .getCandidateCompleteProjects()
    .filter((n) => repo.hasLiveDescendant(n.id))
    .filter((n) => !hasTrashedAncestor(repo, n.id))
    .map((n) => ({ day: calendarDay(n.updatedAt), node: n }));

  const byDay = new Map<string, NodeRow[]>();
  for (const { day, node } of [...completedTodos, ...completeProjects]) {
    const rows = byDay.get(day) ?? [];
    rows.push(node);
    byDay.set(day, rows);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, rows]) => ({
      day,
      rows: rows
        .slice()
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
        .map((n) => toColumnRow(repo, n)),
    }));
}
