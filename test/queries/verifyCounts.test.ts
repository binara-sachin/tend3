import { beforeEach, describe, expect, it } from "vitest";
import { verifyCounts } from "../../queries/verifyCounts.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("verifyCounts", () => {
  it("returns no mismatches when stored counts match the live tree", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    expect(verifyCounts(repo)).toEqual([]);
  });

  it("reports a mismatch when a stored count drifts from reality", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    // deliberately not adjusting root's open_descendant_count

    expect(verifyCounts(repo)).toEqual([
      { nodeId: root.id, stored: 0, expected: 1 },
    ]);
  });

  it("reports a mismatch when a non-project row carries a stray nonzero count", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id, todo.id], 1);

    expect(verifyCounts(repo)).toEqual([{ nodeId: todo.id, stored: 1, expected: 0 }]);
  });
});
