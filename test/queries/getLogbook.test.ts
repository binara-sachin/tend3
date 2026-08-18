import { beforeEach, describe, expect, it } from "vitest";
import { getLogbook } from "../../queries/getLogbook.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getLogbook", () => {
  it("groups a completed todo under its completion day", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.adjustOpenDescendantCount([project.id], 1); // keeps the project itself out of scope for this test
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-06-15T10:00:00.000Z", "2024-06-15T10:00:00.000Z");

    const groups = getLogbook(repo);

    expect(groups).toEqual([
      { day: "2024-06-15", rows: [expect.objectContaining({ id: todo.id })] },
    ]);
  });

  it("groups a derived-complete project under its updated_at day", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([project.id], 1); // CreateNode bookkeeping for the open todo
    repo.updateCompletedAt(todo.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");
    repo.adjustOpenDescendantCount([project.id], -1); // SetCompleted bookkeeping
    repo.updateTitle(project.id, project.title, "2024-06-16T00:00:00.000Z");

    const groups = getLogbook(repo);

    const projectGroup = groups.find((g) => g.day === "2024-06-16");
    expect(projectGroup?.rows.map((r) => r.id)).toContain(project.id);
  });

  it("excludes an incomplete todo and a project with open descendants", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.adjustOpenDescendantCount([project.id], 1);
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);

    const groups = getLogbook(repo);

    expect(groups).toHaveLength(0);
  });

  it("excludes a completed todo whose ancestor project is trashed", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.adjustOpenDescendantCount([project.id], 1);
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const groups = getLogbook(repo);

    expect(groups).toHaveLength(0);
  });

  it("orders days most-recent-first", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.adjustOpenDescendantCount([project.id], 1);
    const older = newNodeInput({ type: "todo", parentId: project.id, sortKey: "a" });
    repo.insert(older);
    repo.updateCompletedAt(older.id, "2024-06-10T00:00:00.000Z", "2024-06-10T00:00:00.000Z");
    const newer = newNodeInput({ type: "todo", parentId: project.id, sortKey: "b" });
    repo.insert(newer);
    repo.updateCompletedAt(newer.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const groups = getLogbook(repo);

    expect(groups.map((g) => g.day)).toEqual(["2024-06-15", "2024-06-10"]);
  });
});
