import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { RestoreNode } from "../../commands/RestoreNode.js";
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

function trashDirectly(id: string, deletedAt: string): void {
  repo.updateDeletedAt(id, deletedAt, deletedAt);
}

describe("RestoreNode.apply", () => {
  it("restores a trashed todo and increments ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    trashDirectly(todo.id, "2024-01-01T00:00:00.000Z");
    // root's count was already decremented when todo was trashed; starts at 0.

    new RestoreNode(todo.id).apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.deletedAt).toBeNull();
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("restoring a project increments ancestors by its whole subtree's open count", () => {
    const rootA = newNodeInput({ type: "project" });
    repo.insert(rootA);
    const sub = newNodeInput({ type: "project", parentId: rootA.id });
    repo.insert(sub);
    const todo1 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "a" });
    const todo2 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "b" });
    repo.insert(todo1);
    repo.insert(todo2);
    repo.adjustOpenDescendantCount([sub.id], 2);
    trashDirectly(sub.id, "2024-01-01T00:00:00.000Z");

    new RestoreNode(sub.id).apply(ctx);

    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(2);
    expect(repo.getById(sub.id)?.openDescendantCount).toBe(2);
  });

  it("rejects restoring a node that isn't trashed", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    expect(() => new RestoreNode(node.id).apply(ctx)).toThrow(/not trashed/i);
  });

  it("throws if the node does not exist", () => {
    expect(() => new RestoreNode("missing").apply(ctx)).toThrow(/not found/i);
  });
});

describe("RestoreNode.invert", () => {
  it("returns a TrashNode that restores the exact prior deleted_at, updated_at, and counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    trashDirectly(todo.id, "2024-01-01T00:00:00.000Z");
    const command = new RestoreNode(todo.id);

    command.apply(ctx);
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);

    command.invert().apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.deletedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new RestoreNode("some-id").invert()).toThrow(/apply/i);
  });
});
