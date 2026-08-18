import { beforeEach, describe, expect, it } from "vitest";
import { getColumn } from "../../queries/getColumn.js";
import { INBOX_ID } from "../../db/constants.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getColumn", () => {
  it("returns children ordered by sort_key, with derived completion for projects", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const sub = newNodeInput({ type: "project", parentId: root.id, sortKey: "a" });
    repo.insert(sub);
    const todo = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b" });
    repo.insert(todo);

    const rows = getColumn(repo, root.id);

    expect(rows.map((r) => r.id)).toEqual([sub.id, todo.id]);
    expect(rows[0]).toMatchObject({
      id: sub.id,
      type: "project",
      sortKey: "a",
      isComplete: false, // empty subtree: no live descendant, second clause of spec 3.4 fails
      openDescendantCount: 0,
    });
    expect(rows[1]).toMatchObject({
      id: todo.id,
      type: "todo",
      sortKey: "b",
      isComplete: null,
      completedAt: null,
      openDescendantCount: 0,
    });
  });

  it("reports a project complete when its count is zero and it has a live descendant", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const sub = newNodeInput({ type: "project", parentId: root.id });
    repo.insert(sub);
    const todo = newNodeInput({ type: "todo", parentId: sub.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const [row] = getColumn(repo, root.id);

    expect(row).toMatchObject({ id: sub.id, isComplete: true });
  });

  it("returns root-level projects, including the seeded Inbox, when parentId is null", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    const ids = getColumn(repo, null).map((r) => r.id);

    expect(ids).toContain(root.id);
    expect(ids).toContain(INBOX_ID);
  });

  it("reports hasNotes true only when notes is non-blank", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const withNotes = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a", notes: "hi" });
    repo.insert(withNotes);
    const blank = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b", notes: "   " });
    repo.insert(blank);
    const empty = newNodeInput({ type: "todo", parentId: root.id, sortKey: "c" });
    repo.insert(empty);

    const rows = getColumn(repo, root.id);

    expect(rows.find((r) => r.id === withNotes.id)?.hasNotes).toBe(true);
    expect(rows.find((r) => r.id === blank.id)?.hasNotes).toBe(false);
    expect(rows.find((r) => r.id === empty.id)?.hasNotes).toBe(false);
  });

  it("excludes trashed children", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const live = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a" });
    repo.insert(live);
    const trashed = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b" });
    repo.insert(trashed);
    repo.updateDeletedAt(trashed.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const ids = getColumn(repo, root.id).map((r) => r.id);

    expect(ids).toEqual([live.id]);
  });
});
