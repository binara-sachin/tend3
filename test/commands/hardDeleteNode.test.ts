import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { HardDeleteNode } from "../../commands/HardDeleteNode.js";
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

describe("HardDeleteNode.apply", () => {
  it("removes an open todo and decrements ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    new HardDeleteNode(todo.id).apply(ctx);

    expect(repo.getById(todo.id)).toBeNull();
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("does not adjust ancestor counts when deleting a project or heading", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const sub = newNodeInput({ type: "project", parentId: root.id });
    repo.insert(sub);

    new HardDeleteNode(sub.id).apply(ctx);

    expect(repo.getById(sub.id)).toBeNull();
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("throws if the node does not exist", () => {
    expect(() => new HardDeleteNode("missing").apply(ctx)).toThrow(/not found/i);
  });

  it("throws if the node has children (would orphan them)", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const child = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(child);
    repo.adjustOpenDescendantCount([root.id], 1);

    expect(() => new HardDeleteNode(root.id).apply(ctx)).toThrow(/children/i);
  });
});

describe("HardDeleteNode.invert", () => {
  it("reconstructs the exact node, including original timestamps, via CreateNode", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({
      type: "todo",
      parentId: root.id,
      title: "Buy milk",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    const command = new HardDeleteNode(todo.id);
    command.apply(ctx);
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);

    command.invert().apply(ctx);

    const restored = repo.getById(todo.id);
    expect(restored).toEqual({
      id: todo.id,
      parentId: root.id,
      type: "todo",
      title: "Buy milk",
      notes: todo.notes,
      sortKey: todo.sortKey,
      whenDate: todo.whenDate,
      deadline: todo.deadline,
      completedAt: null,
      deletedAt: null,
      isSystem: false,
      openDescendantCount: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new HardDeleteNode("some-id").invert()).toThrow(/apply/i);
  });

  it("throws on invert() when the deleted node was completed or trashed (not just-created)", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const completedTodo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(completedTodo);
    repo.updateCompletedAt(completedTodo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const command = new HardDeleteNode(completedTodo.id);
    command.apply(ctx);

    expect(() => command.invert()).toThrow(/completed or trashed/i);
  });
});
