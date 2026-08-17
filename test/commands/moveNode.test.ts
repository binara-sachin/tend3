import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { MoveNode } from "../../commands/MoveNode.js";
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

describe("MoveNode.apply", () => {
  it("reorders within the same parent without changing counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todoA = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a" });
    const todoB = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b" });
    repo.insert(todoA);
    repo.insert(todoB);
    repo.adjustOpenDescendantCount([root.id], 2);

    new MoveNode(todoA.id, root.id, "c").apply(ctx);

    const row = repo.getById(todoA.id);
    expect(row?.parentId).toBe(root.id);
    expect(row?.sortKey).toBe("c");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(2);
  });

  it("moving an open todo decrements old ancestor counts and increments new ancestor counts", () => {
    const rootA = newNodeInput({ type: "project" });
    const rootB = newNodeInput({ type: "project" });
    repo.insert(rootA);
    repo.insert(rootB);
    const todo = newNodeInput({ type: "todo", parentId: rootA.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([rootA.id], 1);

    new MoveNode(todo.id, rootB.id, "a").apply(ctx);

    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(rootB.id)?.openDescendantCount).toBe(1);
    expect(repo.getById(todo.id)?.parentId).toBe(rootB.id);
  });

  it("moving a project carries its whole subtree's open count to the new ancestors", () => {
    const rootA = newNodeInput({ type: "project" });
    const rootB = newNodeInput({ type: "project" });
    repo.insert(rootA);
    repo.insert(rootB);
    const sub = newNodeInput({ type: "project", parentId: rootA.id });
    repo.insert(sub);
    const todo1 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "a" });
    const todo2 = newNodeInput({ type: "todo", parentId: sub.id, sortKey: "b" });
    repo.insert(todo1);
    repo.insert(todo2);
    repo.adjustOpenDescendantCount([sub.id, rootA.id], 2);

    new MoveNode(sub.id, rootB.id, "a").apply(ctx);

    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(rootB.id)?.openDescendantCount).toBe(2);
    expect(repo.getById(sub.id)?.openDescendantCount).toBe(2);
  });

  it("does not adjust counts when moving a trashed node", () => {
    const rootA = newNodeInput({ type: "project" });
    const rootB = newNodeInput({ type: "project" });
    repo.insert(rootA);
    repo.insert(rootB);
    const todo = newNodeInput({ type: "todo", parentId: rootA.id });
    repo.insert(todo);
    repo.updateDeletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    new MoveNode(todo.id, rootB.id, "a").apply(ctx);

    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(0);
    expect(repo.getById(rootB.id)?.openDescendantCount).toBe(0);
  });

  it("rejects moving the Inbox", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    expect(() => new MoveNode(INBOX_ID, root.id, "a").apply(ctx)).toThrow(/inbox/i);
  });

  it("rejects moving a node into itself", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    expect(() => new MoveNode(root.id, root.id, "a").apply(ctx)).toThrow(/itself/i);
  });

  it("rejects moving a node into its own descendant", () => {
    const a = newNodeInput({ type: "project" });
    repo.insert(a);
    const b = newNodeInput({ type: "project", parentId: a.id });
    repo.insert(b);
    const c = newNodeInput({ type: "project", parentId: b.id });
    repo.insert(c);

    expect(() => new MoveNode(a.id, c.id, "a").apply(ctx)).toThrow(/descendant/i);
  });

  it("rejects making a non-project node a root", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    expect(() => new MoveNode(todo.id, null, "a").apply(ctx)).toThrow(/root/i);
  });

  it("rejects a heading whose new parent is not a project", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const otherHeading = newNodeInput({ type: "heading", parentId: root.id, sortKey: "a" });
    repo.insert(otherHeading);
    const heading = newNodeInput({ type: "heading", parentId: root.id, sortKey: "b" });
    repo.insert(heading);

    expect(() => new MoveNode(heading.id, otherHeading.id, "a").apply(ctx)).toThrow(/heading/i);
  });

  it("rejects moving under a todo parent", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todoParent = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a" });
    const other = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b" });
    repo.insert(todoParent);
    repo.insert(other);
    repo.adjustOpenDescendantCount([root.id], 2);

    expect(() => new MoveNode(other.id, todoParent.id, "a").apply(ctx)).toThrow(/todo/i);
  });

  it("rejects moving under a missing parent", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    expect(() => new MoveNode(root.id, "missing", "a").apply(ctx)).toThrow(/not found/i);
  });

  it("throws if the node does not exist", () => {
    expect(() => new MoveNode("missing", null, "a").apply(ctx)).toThrow(/not found/i);
  });
});

describe("MoveNode.invert", () => {
  it("restores the exact prior parent, sort_key, updated_at, and counts", () => {
    const rootA = newNodeInput({ type: "project" });
    const rootB = newNodeInput({ type: "project" });
    repo.insert(rootA);
    repo.insert(rootB);
    const todo = newNodeInput({
      type: "todo",
      parentId: rootA.id,
      sortKey: "m",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([rootA.id], 1);
    const command = new MoveNode(todo.id, rootB.id, "z");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.parentId).toBe(rootA.id);
    expect(row?.sortKey).toBe("m");
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(repo.getById(rootA.id)?.openDescendantCount).toBe(1);
    expect(repo.getById(rootB.id)?.openDescendantCount).toBe(0);
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new MoveNode("some-id", null, "a").invert()).toThrow(/apply/i);
  });
});
