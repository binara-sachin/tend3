import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { Rebalance } from "../../commands/Rebalance.js";
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

describe("Rebalance.apply", () => {
  it("renumbers all children evenly, preserving their existing order", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const a = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    const b = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "b" });
    repo.insert(a);
    repo.insert(b);
    repo.adjustOpenDescendantCount([parent.id], 2);

    new Rebalance(parent.id).apply(ctx);

    const [first, second] = repo.getChildren(parent.id);
    expect(first?.id).toBe(a.id);
    expect(second?.id).toBe(b.id);
    expect(first && second && first.sortKey < second.sortKey).toBe(true);
  });

  it("renumbers children regardless of completion or trashed status", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const completed = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    const trashed = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "b" });
    repo.insert(completed);
    repo.insert(trashed);
    repo.updateCompletedAt(completed.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    repo.updateDeletedAt(trashed.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    new Rebalance(parent.id).apply(ctx);

    expect(repo.getById(completed.id)?.sortKey).not.toBe("a");
    expect(repo.getById(trashed.id)?.sortKey).not.toBe("b");
  });

  it("does nothing when the parent has no children", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);

    expect(() => new Rebalance(parent.id).apply(ctx)).not.toThrow();
  });
});

describe("Rebalance.invert", () => {
  it("restores the exact prior sort_key for every affected child", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const a = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    const b = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "b" });
    repo.insert(a);
    repo.insert(b);
    repo.adjustOpenDescendantCount([parent.id], 2);
    const command = new Rebalance(parent.id);

    command.apply(ctx);
    command.invert().apply(ctx);

    expect(repo.getById(a.id)?.sortKey).toBe("a");
    expect(repo.getById(b.id)?.sortKey).toBe("b");
  });

  it("restores the exact prior updated_at, even when a single child's sort_key happens not to change", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const only = newNodeInput({
      type: "todo",
      parentId: parent.id,
      sortKey: "a0",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(only);
    repo.adjustOpenDescendantCount([parent.id], 1);
    const command = new Rebalance(parent.id);

    command.apply(ctx);
    command.invert().apply(ctx);

    // evenlySpacedKeys(1) regenerates the same single key ("a0"), so this
    // exercises the case where the sort_key value doesn't visibly change
    // but updated_at must still be restored exactly, not left at ctx.now().
    expect(repo.getById(only.id)?.sortKey).toBe("a0");
    expect(repo.getById(only.id)?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new Rebalance("some-id").invert()).toThrow(/apply/i);
  });
});
