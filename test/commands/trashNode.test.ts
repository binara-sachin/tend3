import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { TrashNode } from "../../commands/TrashNode.js";
import { INBOX_ID } from "../../db/constants.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { verifyCounts } from "../../queries/verifyCounts.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;
let ctx: CommandContext;

beforeEach(() => {
  ({ repo } = createTestRepo());
  ctx = { repo, now: fixedClock("2024-06-01T00:00:00.000Z"), genId: generateId };
});

afterEach(() => {
  expect(verifyCounts(repo)).toEqual([]);
});

describe("TrashNode.apply", () => {
  it("trashes a live todo and decrements ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    new TrashNode(todo.id, "2024-06-01T00:00:00.000Z").apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.deletedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("trashing a project decrements ancestors by its whole subtree's open count, but leaves its own count untouched", () => {
    const rootA = newNodeInput({ type: "project" });
    repo.insert(rootA);
    const sub = newNodeInput({ type: "project", parentId: rootA.id });
    repo.insert(sub);
    const todo1 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "a" });
    const todo2 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "b" });
    repo.insert(todo1);
    repo.insert(todo2);
    repo.adjustOpenDescendantCount([sub.id, rootA.id], 2);

    new TrashNode(sub.id, "2024-06-01T00:00:00.000Z").apply(ctx);

    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(sub.id)?.openDescendantCount).toBe(2);
  });

  it("does not adjust counts when the trashed node has no live open todos", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);

    new TrashNode(heading.id, "2024-06-01T00:00:00.000Z").apply(ctx);

    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("decrements only the nearest trashed ancestor, not further ancestors above it", () => {
    const grandparent = newNodeInput({ type: "project" });
    repo.insert(grandparent);
    const middle = newNodeInput({ type: "project", parentId: grandparent.id });
    repo.insert(middle);
    const todo = newNodeInput({ type: "todo", parentId: middle.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([middle.id, grandparent.id], 1);

    // Trash the middle project first, so grandparent no longer counts through it.
    new TrashNode(middle.id, "2024-05-01T00:00:00.000Z").apply(ctx);
    expect(repo.getById(grandparent.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(middle.id)?.openDescendantCount).toBe(1);

    // Now trash the todo underneath the already-trashed middle project: only
    // middle's own count should move; grandparent (beyond the trashed
    // boundary) must be untouched.
    new TrashNode(todo.id, "2024-06-01T00:00:00.000Z").apply(ctx);
    expect(repo.getById(middle.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(grandparent.id)?.openDescendantCount).toBe(0);
  });

  it("rejects trashing the Inbox", () => {
    expect(() => new TrashNode(INBOX_ID, "2024-06-01T00:00:00.000Z").apply(ctx)).toThrow(
      /inbox/i,
    );
  });

  it("rejects trashing an already-trashed node", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    expect(() => new TrashNode(node.id, "2024-06-01T00:00:00.000Z").apply(ctx)).toThrow(
      /already trashed/i,
    );
  });

  it("throws if the node does not exist", () => {
    expect(() => new TrashNode("missing", "2024-06-01T00:00:00.000Z").apply(ctx)).toThrow(
      /not found/i,
    );
  });
});

describe("TrashNode.invert", () => {
  it("returns a RestoreNode that restores deleted_at, updated_at, and counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({
      type: "todo",
      parentId: root.id,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);
    const command = new TrashNode(todo.id, "2024-06-01T00:00:00.000Z");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.deletedAt).toBeNull();
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new TrashNode("some-id", "2024-06-01T00:00:00.000Z").invert()).toThrow(
      /apply/i,
    );
  });
});
