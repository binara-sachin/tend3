import type { NodeRepository } from "../repo/NodeRepository.js";
import type { NodeRow } from "../repo/types.js";
import { hasTrashedAncestor } from "./ancestryFilters.js";
import { toColumnRow, type ColumnRow } from "./getColumn.js";

export interface TodayGroup {
  projectId: string;
  projectTitle: string;
  rows: ColumnRow[];
}

const FAR_FUTURE = "9999-12-31";

function rankKey(row: NodeRow, today: string): [number, string, string, string] {
  const overdue = row.deadline !== null && row.deadline < today ? 0 : 1;
  return [overdue, row.deadline ?? FAR_FUTURE, row.whenDate ?? FAR_FUTURE, row.sortKey];
}

function compareRank(a: [number, string, string, string], b: [number, string, string, string]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

export function getToday(repo: NodeRepository, today: string): TodayGroup[] {
  const candidates = repo
    .getTodayCandidates(today)
    .filter((n) => !hasTrashedAncestor(repo, n.id));

  const groups = new Map<string, { project: NodeRow; rows: NodeRow[] }>();
  for (const node of candidates) {
    const projectId = repo.getAncestorProjectIds(node.id)[0];
    if (projectId === undefined) continue;
    const project = repo.getById(projectId);
    if (project === null) continue;

    const existing = groups.get(projectId);
    if (existing) {
      existing.rows.push(node);
    } else {
      groups.set(projectId, { project, rows: [node] });
    }
  }

  const entries = [...groups.values()];
  for (const entry of entries) {
    entry.rows.sort((a, b) => compareRank(rankKey(a, today), rankKey(b, today)));
  }
  entries.sort((a, b) => compareRank(rankKey(a.rows[0]!, today), rankKey(b.rows[0]!, today)));

  return entries.map(({ project, rows }) => ({
    projectId: project.id,
    projectTitle: project.title,
    rows: rows.map((n) => toColumnRow(repo, n)),
  }));
}
