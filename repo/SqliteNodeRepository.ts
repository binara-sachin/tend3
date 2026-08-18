import type Database from "better-sqlite3";
import type { NodeRepository } from "./NodeRepository.js";
import type { NewNodeInput, NodeRow, NodeType } from "./types.js";

interface RawNodeRow {
  id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  notes: string;
  sort_key: string;
  when_date: string | null;
  deadline: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  is_system: number;
  open_descendant_count: number;
  created_at: string;
  updated_at: string;
}

function toNodeRow(raw: RawNodeRow): NodeRow {
  return {
    id: raw.id,
    parentId: raw.parent_id,
    type: raw.type,
    title: raw.title,
    notes: raw.notes,
    sortKey: raw.sort_key,
    whenDate: raw.when_date,
    deadline: raw.deadline,
    completedAt: raw.completed_at,
    deletedAt: raw.deleted_at,
    isSystem: raw.is_system === 1,
    openDescendantCount: raw.open_descendant_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

const ANCESTORS_CTE = `
  WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id = @id
    UNION ALL
    SELECT n.id, n.parent_id FROM nodes n
    JOIN ancestors a ON n.id = a.parent_id
  )
`;

export class SqliteNodeRepository implements NodeRepository {
  constructor(private readonly db: Database.Database) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  insert(input: NewNodeInput): void {
    this.db
      .prepare(
        `INSERT INTO nodes (
          id, parent_id, type, title, notes, sort_key,
          when_date, deadline, completed_at, deleted_at,
          is_system, open_descendant_count, created_at, updated_at
        ) VALUES (
          @id, @parentId, @type, @title, @notes, @sortKey,
          @whenDate, @deadline, NULL, NULL,
          0, 0, @createdAt, @updatedAt
        )`,
      )
      .run(input);
  }

  getById(id: string): NodeRow | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as
      | RawNodeRow
      | undefined;
    return row ? toNodeRow(row) : null;
  }

  getChildren(parentId: string | null): NodeRow[] {
    const rows =
      parentId === null
        ? this.db
            .prepare(
              "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY sort_key",
            )
            .all()
        : this.db
            .prepare(
              "SELECT * FROM nodes WHERE parent_id = ? ORDER BY sort_key",
            )
            .all(parentId);
    return (rows as RawNodeRow[]).map(toNodeRow);
  }

  hardDelete(id: string): void {
    this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
  }

  hardDeleteSubtree(rootId: string): void {
    this.db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
          SELECT id FROM nodes WHERE id = @rootId
          UNION ALL
          SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id
        )
        DELETE FROM nodes WHERE id IN (SELECT id FROM subtree)`,
      )
      .run({ rootId });
  }

  getTrashRoots(): NodeRow[] {
    const trashed = this.db
      .prepare("SELECT * FROM nodes WHERE deleted_at IS NOT NULL")
      .all() as RawNodeRow[];
    const trashedIds = new Set(trashed.map((r) => r.id));

    return trashed
      .filter((raw) => !this.getAncestorIds(raw.id).some((ancestorId) => trashedIds.has(ancestorId)))
      .map(toNodeRow);
  }

  updateParentAndSortKey(
    id: string,
    parentId: string | null,
    sortKey: string,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        "UPDATE nodes SET parent_id = ?, sort_key = ?, updated_at = ? WHERE id = ?",
      )
      .run(parentId, sortKey, updatedAt, id);
  }

  updateTitle(id: string, title: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, updatedAt, id);
  }

  updateSortKey(id: string, sortKey: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE nodes SET sort_key = ?, updated_at = ? WHERE id = ?")
      .run(sortKey, updatedAt, id);
  }

  updateNotes(id: string, notes: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE nodes SET notes = ?, updated_at = ? WHERE id = ?")
      .run(notes, updatedAt, id);
  }

  updateWhenDate(id: string, whenDate: string | null, updatedAt: string): void {
    this.db
      .prepare("UPDATE nodes SET when_date = ?, updated_at = ? WHERE id = ?")
      .run(whenDate, updatedAt, id);
  }

  updateDeadline(id: string, deadline: string | null, updatedAt: string): void {
    this.db
      .prepare("UPDATE nodes SET deadline = ?, updated_at = ? WHERE id = ?")
      .run(deadline, updatedAt, id);
  }

  updateCompletedAt(
    id: string,
    completedAt: string | null,
    updatedAt: string,
  ): void {
    this.db
      .prepare("UPDATE nodes SET completed_at = ?, updated_at = ? WHERE id = ?")
      .run(completedAt, updatedAt, id);
  }

  updateDeletedAt(
    id: string,
    deletedAt: string | null,
    updatedAt: string,
  ): void {
    this.db
      .prepare("UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(deletedAt, updatedAt, id);
  }

  getAncestorIds(id: string): string[] {
    const rows = this.db
      .prepare(`${ANCESTORS_CTE} SELECT id FROM ancestors WHERE id != @id`)
      .all({ id }) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  getAncestorProjectIds(id: string): string[] {
    // Unlike getAncestorIds, this stops walking past the first trashed
    // ancestor: that node's own open_descendant_count still tracks its live
    // subtree (see recomputeOpenDescendantCounts), but ancestors beyond it
    // are hidden behind it and must not be adjusted by changes underneath.
    // The starting node's own deleted_at is irrelevant to this walk (e.g.
    // RestoreNode calls this while the node is still marked trashed) — the
    // base row reports it as NULL so the guard only ever gates on ancestors.
    const rows = this.db
      .prepare(
        `WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (
          SELECT id, parent_id, NULL AS deleted_at FROM nodes WHERE id = @id
          UNION ALL
          SELECT n.id, n.parent_id, n.deleted_at FROM nodes n
          JOIN ancestors a ON n.id = a.parent_id
          WHERE a.deleted_at IS NULL
        )
        SELECT n.id FROM ancestors a
        JOIN nodes n ON n.id = a.id
        WHERE a.id != @id AND n.type = 'project'`,
      )
      .all({ id }) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  isDescendantOf(candidateId: string, ancestorId: string): boolean {
    return this.getAncestorIds(candidateId).includes(ancestorId);
  }

  adjustOpenDescendantCount(ids: string[], delta: number): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare(
      "UPDATE nodes SET open_descendant_count = open_descendant_count + ? WHERE id = ?",
    );
    for (const id of ids) {
      stmt.run(delta, id);
    }
  }

  countLiveOpenTodosInSubtree(rootId: string): number {
    const row = this.db
      .prepare(
        `WITH RECURSIVE subtree(id, type, completed_at) AS (
          SELECT id, type, completed_at FROM nodes
          WHERE parent_id = ? AND deleted_at IS NULL
          UNION ALL
          SELECT n.id, n.type, n.completed_at FROM nodes n
          JOIN subtree s ON n.parent_id = s.id
          WHERE n.deleted_at IS NULL
        )
        SELECT COUNT(*) AS count FROM subtree WHERE type = 'todo' AND completed_at IS NULL`,
      )
      .get(rootId) as { count: number };
    return row.count;
  }

  recomputeOpenDescendantCounts(): Map<string, number> {
    const rows = this.db.prepare("SELECT * FROM nodes").all() as RawNodeRow[];
    const nodes = rows.map(toNodeRow);

    const byParent = new Map<string, NodeRow[]>();
    for (const node of nodes) {
      if (node.parentId === null) continue;
      const siblings = byParent.get(node.parentId) ?? [];
      siblings.push(node);
      byParent.set(node.parentId, siblings);
    }

    function countLiveOpenTodos(nodeId: string): number {
      let count = 0;
      for (const child of byParent.get(nodeId) ?? []) {
        if (child.deletedAt !== null) continue;
        if (child.type === "todo") {
          if (child.completedAt === null) count += 1;
        } else {
          count += countLiveOpenTodos(child.id);
        }
      }
      return count;
    }

    const counts = new Map<string, number>();
    for (const node of nodes) {
      if (node.type === "project") {
        counts.set(node.id, countLiveOpenTodos(node.id));
      }
    }
    return counts;
  }

  getNonProjectRowsWithNonzeroCount(): NodeRow[] {
    const rows = this.db
      .prepare("SELECT * FROM nodes WHERE type != 'project' AND open_descendant_count != 0")
      .all() as RawNodeRow[];
    return rows.map(toNodeRow);
  }

  hasLiveDescendant(id: string): boolean {
    const row = this.db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
          SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
          UNION ALL
          SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL
        )
        SELECT COUNT(*) AS count FROM subtree`,
      )
      .get(id) as { count: number };
    return row.count > 0;
  }
}
