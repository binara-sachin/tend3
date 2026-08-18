import { beforeEach, describe, expect, it } from "vitest";
import { getNode } from "../../queries/getNode.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getNode", () => {
  it("returns a node's detail fields", () => {
    const todo = newNodeInput({
      type: "todo",
      title: "Buy milk",
      notes: "2%",
      whenDate: "2024-06-01",
      deadline: "2024-06-05",
    });
    repo.insert(todo);

    expect(getNode(repo, todo.id)).toEqual({
      id: todo.id,
      type: "todo",
      title: "Buy milk",
      notes: "2%",
      whenDate: "2024-06-01",
      deadline: "2024-06-05",
      completedAt: null,
      path: [],
    });
  });

  it("returns null for a missing id", () => {
    expect(getNode(repo, "missing")).toBeNull();
  });

  it("includes the ancestor path, nearest first, with titles", () => {
    const project = newNodeInput({ type: "project", title: "Work" });
    repo.insert(project);
    const heading = newNodeInput({ type: "heading", parentId: project.id, title: "This Week" });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id, title: "Buy milk" });
    repo.insert(todo);

    expect(getNode(repo, todo.id)?.path).toEqual([
      { id: heading.id, type: "heading", title: "This Week" },
      { id: project.id, type: "project", title: "Work" },
    ]);
  });
});
