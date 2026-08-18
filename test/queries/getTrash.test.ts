import { beforeEach, describe, expect, it } from "vitest";
import { getTrash } from "../../queries/getTrash.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getTrash", () => {
  it("returns a trashed root", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const rows = getTrash(repo);

    expect(rows.map((r) => r.id)).toEqual([project.id]);
  });

  it("includes the deletedAt timestamp on each row", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const rows = getTrash(repo);

    expect(rows[0]?.deletedAt).toBe("2024-06-15T00:00:00.000Z");
  });

  it("does not list a separately-trashed descendant of an already-trashed root independently", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);
    repo.updateDeletedAt(todo.id, "2024-06-14T00:00:00.000Z", "2024-06-14T00:00:00.000Z");
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const rows = getTrash(repo);

    expect(rows.map((r) => r.id)).toEqual([project.id]);
  });

  it("orders by deletedAt descending", () => {
    const older = newNodeInput({ type: "project", title: "Older" });
    repo.insert(older);
    repo.updateDeletedAt(older.id, "2024-06-10T00:00:00.000Z", "2024-06-10T00:00:00.000Z");
    const newer = newNodeInput({ type: "project", title: "Newer" });
    repo.insert(newer);
    repo.updateDeletedAt(newer.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const rows = getTrash(repo);

    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
  });
});
