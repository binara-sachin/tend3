import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { SetCompleted } from "../../commands/SetCompleted.js";
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

describe("SetCompleted.apply", () => {
  it("marks a todo complete and decrements ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    new SetCompleted(todo.id, "2024-06-01T00:00:00.000Z").apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.completedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("marks a todo incomplete and increments ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    new SetCompleted(todo.id, null).apply(ctx);

    expect(repo.getById(todo.id)?.completedAt).toBeNull();
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("does not adjust counts for a trashed todo (it was never counted)", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.updateDeletedAt(todo.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    new SetCompleted(todo.id, "2024-06-01T00:00:00.000Z").apply(ctx);

    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("rejects non-todo nodes", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    expect(() => new SetCompleted(root.id, "2024-06-01T00:00:00.000Z").apply(ctx)).toThrow(
      /todo/i,
    );
  });

  it("throws if the node does not exist", () => {
    expect(() => new SetCompleted("missing", "2024-06-01T00:00:00.000Z").apply(ctx)).toThrow(
      /not found/i,
    );
  });
});

describe("SetCompleted.invert", () => {
  it("restores the exact prior completed_at, updated_at, and ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id, updatedAt: "2024-01-01T00:00:00.000Z" });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);
    const command = new SetCompleted(todo.id, "2024-06-01T00:00:00.000Z");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(todo.id);
    expect(row?.completedAt).toBeNull();
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new SetCompleted("some-id", "2024-06-01T00:00:00.000Z").invert()).toThrow(
      /apply/i,
    );
  });
});
