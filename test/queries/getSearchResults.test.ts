import { beforeEach, describe, expect, it } from "vitest";
import { getSearchResults } from "../../queries/getSearchResults.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getSearchResults", () => {
  it("returns a live matching todo with its ancestor path, nearest first", () => {
    const project = newNodeInput({ type: "project", title: "Groceries" });
    repo.insert(project);
    const heading = newNodeInput({ type: "heading", parentId: project.id, title: "Dairy" });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id, title: "Buy milk" });
    repo.insert(todo);

    const results = getSearchResults(repo, "mil");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: todo.id,
      type: "todo",
      title: "Buy milk",
      path: [
        { id: heading.id, type: "heading" },
        { id: project.id, type: "project" },
      ],
    });
  });

  it("excludes a trashed todo even though nodes_fts still indexes it", () => {
    const todo = newNodeInput({ type: "todo", title: "Buy milk" });
    repo.insert(todo);
    repo.updateDeletedAt(todo.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const results = getSearchResults(repo, "milk");

    expect(results).toHaveLength(0);
  });

  it("excludes a live todo whose ancestor is trashed", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id, title: "Buy milk" });
    repo.insert(todo);
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const results = getSearchResults(repo, "milk");

    expect(results).toHaveLength(0);
  });

  it("matches on notes, not just title", () => {
    const todo = newNodeInput({ type: "todo", title: "Groceries", notes: "get oat milk" });
    repo.insert(todo);

    const results = getSearchResults(repo, "oat");

    expect(results.map((r) => r.id)).toContain(todo.id);
  });
});
