import { beforeEach, describe, expect, it } from "vitest";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("insert / getById", () => {
  it("round-trips every field", () => {
    const input = newNodeInput({
      type: "todo",
      title: "Buy milk",
      notes: "2%",
      sortKey: "a1",
      whenDate: "2024-06-01",
      deadline: "2024-06-05",
    });

    repo.insert(input);
    const row = repo.getById(input.id);

    expect(row).toEqual({
      id: input.id,
      parentId: null,
      type: "todo",
      title: "Buy milk",
      notes: "2%",
      sortKey: "a1",
      whenDate: "2024-06-01",
      deadline: "2024-06-05",
      completedAt: null,
      deletedAt: null,
      isSystem: false,
      openDescendantCount: 0,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
  });

  it("returns null for a missing id", () => {
    expect(repo.getById("does-not-exist")).toBeNull();
  });
});

describe("getChildren", () => {
  it("returns only direct children of the given parent, ordered by sort_key", () => {
    const parent = newNodeInput({ type: "project", sortKey: "a0" });
    const other = newNodeInput({ type: "project", sortKey: "a1" });
    repo.insert(parent);
    repo.insert(other);

    const childB = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "b" });
    const childA = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    const grandchild = newNodeInput({ type: "todo", parentId: other.id, sortKey: "a" });
    repo.insert(childB);
    repo.insert(childA);
    repo.insert(grandchild);

    const children = repo.getChildren(parent.id);

    expect(children.map((c) => c.id)).toEqual([childA.id, childB.id]);
  });
});

describe("hardDelete", () => {
  it("removes the row permanently", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    repo.hardDelete(node.id);

    expect(repo.getById(node.id)).toBeNull();
  });
});

describe("hardDeleteSubtree", () => {
  it("removes the root and every descendant, regardless of each one's own deleted_at", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(todo);
    const other = newNodeInput({ type: "project" });
    repo.insert(other);

    repo.hardDeleteSubtree(root.id);

    expect(repo.getById(root.id)).toBeNull();
    expect(repo.getById(heading.id)).toBeNull();
    expect(repo.getById(todo.id)).toBeNull();
    expect(repo.getById(other.id)).not.toBeNull();
  });
});

describe("getTrashRoots", () => {
  it("returns trashed nodes with no trashed ancestor, excluding subsumed descendants", () => {
    const trashedRoot = newNodeInput({ type: "project" });
    repo.insert(trashedRoot);
    const separatelyTrashedChild = newNodeInput({ type: "project", parentId: trashedRoot.id });
    repo.insert(separatelyTrashedChild);
    const untouched = newNodeInput({ type: "project" });
    repo.insert(untouched);

    repo.updateDeletedAt(
      separatelyTrashedChild.id,
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z",
    );
    repo.updateDeletedAt(trashedRoot.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    expect(repo.getTrashRoots().map((n) => n.id)).toEqual([trashedRoot.id]);
  });

  it("returns an empty list when nothing is trashed", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    expect(repo.getTrashRoots()).toEqual([]);
  });
});

describe("update methods", () => {
  it("updateTitle changes only title and updated_at", () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);

    repo.updateTitle(node.id, "new", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.title).toBe("new");
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
    expect(row?.notes).toBe(node.notes);
  });

  it("updateNotes changes only notes and updated_at", () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);

    repo.updateNotes(node.id, "new notes", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.notes).toBe("new notes");
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("updateWhenDate changes only when_date and updated_at", () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);

    repo.updateWhenDate(node.id, "2024-07-01", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.whenDate).toBe("2024-07-01");
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("updateDeadline changes only deadline and updated_at", () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);

    repo.updateDeadline(node.id, "2024-07-10", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.deadline).toBe("2024-07-10");
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("updateCompletedAt changes only completed_at and updated_at", () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);

    repo.updateCompletedAt(node.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.completedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("updateDeletedAt changes only deleted_at and updated_at", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    repo.updateDeletedAt(node.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.deletedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("updateParentAndSortKey changes only parent_id, sort_key and updated_at", () => {
    const oldParent = newNodeInput({ type: "project", sortKey: "a0" });
    const newParent = newNodeInput({ type: "project", sortKey: "a1" });
    const node = newNodeInput({ type: "todo", parentId: oldParent.id, sortKey: "a" });
    repo.insert(oldParent);
    repo.insert(newParent);
    repo.insert(node);

    repo.updateParentAndSortKey(node.id, newParent.id, "b", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.parentId).toBe(newParent.id);
    expect(row?.sortKey).toBe("b");
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
  });
});

describe("ancestor walk", () => {
  it("getAncestorIds returns all ancestors of a deeply nested node, excluding itself", () => {
    const root = newNodeInput({ type: "project" });
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(root);
    repo.insert(heading);
    repo.insert(todo);

    expect(repo.getAncestorIds(todo.id).sort()).toEqual([heading.id, root.id].sort());
    expect(repo.getAncestorIds(root.id)).toEqual([]);
  });

  it("getAncestorProjectIds skips non-project ancestors", () => {
    const root = newNodeInput({ type: "project" });
    const sub = newNodeInput({ type: "project", parentId: root.id });
    const heading = newNodeInput({ type: "heading", parentId: sub.id });
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(root);
    repo.insert(sub);
    repo.insert(heading);
    repo.insert(todo);

    expect(repo.getAncestorProjectIds(todo.id).sort()).toEqual([sub.id, root.id].sort());
  });

  it("isDescendantOf detects transitive descendants", () => {
    const root = newNodeInput({ type: "project" });
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    const unrelated = newNodeInput({ type: "project" });
    repo.insert(root);
    repo.insert(heading);
    repo.insert(todo);
    repo.insert(unrelated);

    expect(repo.isDescendantOf(todo.id, root.id)).toBe(true);
    expect(repo.isDescendantOf(root.id, todo.id)).toBe(false);
    expect(repo.isDescendantOf(unrelated.id, root.id)).toBe(false);
  });

  it("getAncestorProjectIds includes a trashed ancestor's own count but stops propagating beyond it", () => {
    const grandparent = newNodeInput({ type: "project" });
    const trashedParent = newNodeInput({ type: "project", parentId: grandparent.id });
    const heading = newNodeInput({ type: "heading", parentId: trashedParent.id });
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(grandparent);
    repo.insert(trashedParent);
    repo.insert(heading);
    repo.insert(todo);

    repo.updateDeletedAt(trashedParent.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    expect(repo.getAncestorProjectIds(todo.id)).toEqual([trashedParent.id]);
  });

  it("getAncestorProjectIds ignores the starting node's own trashed status", () => {
    const root = newNodeInput({ type: "project" });
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(root);
    repo.insert(todo);

    // The starting node itself is trashed (as it would be mid-RestoreNode,
    // before its own deleted_at is cleared) — only ancestors ABOVE it should
    // gate the walk, not its own state.
    repo.updateDeletedAt(todo.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    expect(repo.getAncestorProjectIds(todo.id)).toEqual([root.id]);
  });
});

describe("adjustOpenDescendantCount", () => {
  it("bumps open_descendant_count for each given id by delta", () => {
    const a = newNodeInput({ type: "project" });
    const b = newNodeInput({ type: "project" });
    repo.insert(a);
    repo.insert(b);

    repo.adjustOpenDescendantCount([a.id, b.id], 1);
    repo.adjustOpenDescendantCount([a.id, b.id], 1);
    repo.adjustOpenDescendantCount([a.id], -1);

    expect(repo.getById(a.id)?.openDescendantCount).toBe(1);
    expect(repo.getById(b.id)?.openDescendantCount).toBe(2);
  });
});

describe("countLiveOpenTodosInSubtree", () => {
  it("counts open todos transitively, skipping completed and trashed branches", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    const openTodo = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a" });
    const completedTodo = newNodeInput({
      type: "todo",
      parentId: root.id,
      sortKey: "b",
    });
    repo.insert(openTodo);
    repo.insert(completedTodo);
    repo.updateCompletedAt(completedTodo.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    const sub = newNodeInput({ type: "project", parentId: root.id, sortKey: "c" });
    repo.insert(sub);
    const subTodo = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "a" });
    repo.insert(subTodo);

    const trashedHeading = newNodeInput({
      type: "heading",
      parentId: root.id,
      sortKey: "d",
    });
    repo.insert(trashedHeading);
    repo.updateDeletedAt(trashedHeading.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");
    const hiddenTodo = newNodeInput({
      type: "todo",
      parentId: trashedHeading.id,
      sortKey: "a",
    });
    repo.insert(hiddenTodo);

    expect(repo.countLiveOpenTodosInSubtree(root.id)).toBe(2);
  });
});

describe("recomputeOpenDescendantCounts", () => {
  it("computes each project's own live-subtree count, stopping at trashed nodes", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const mid = newNodeInput({ type: "project", parentId: root.id });
    repo.insert(mid);
    const todo = newNodeInput({ type: "todo", parentId: mid.id });
    repo.insert(todo);

    repo.updateDeletedAt(mid.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    const counts = repo.recomputeOpenDescendantCounts();

    expect(counts.get(mid.id)).toBe(1);
    expect(counts.get(root.id)).toBe(0);
  });
});

describe("getNonProjectRowsWithNonzeroCount", () => {
  it("flags a todo or heading with a stray nonzero open_descendant_count", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([todo.id], 1);

    expect(repo.getNonProjectRowsWithNonzeroCount().map((n) => n.id)).toEqual([todo.id]);
  });

  it("returns an empty list when every non-project row has a zero count", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);

    expect(repo.getNonProjectRowsWithNonzeroCount()).toEqual([]);
  });
});

describe("hasLiveDescendant", () => {
  it("is true when a live descendant exists at any depth, completed or not", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    expect(repo.hasLiveDescendant(root.id)).toBe(true);
  });

  it("is false for an empty subtree", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    expect(repo.hasLiveDescendant(root.id)).toBe(false);
  });

  it("is false when the only descendant is trashed", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.updateDeletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    expect(repo.hasLiveDescendant(root.id)).toBe(false);
  });
});

describe("transaction", () => {
  it("rolls back all writes if the callback throws", () => {
    const node = newNodeInput({ type: "project" });

    expect(() =>
      repo.transaction(() => {
        repo.insert(node);
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(repo.getById(node.id)).toBeNull();
  });

  it("commits all writes when the callback succeeds", () => {
    const node = newNodeInput({ type: "project" });

    repo.transaction(() => {
      repo.insert(node);
    });

    expect(repo.getById(node.id)).not.toBeNull();
  });
});
