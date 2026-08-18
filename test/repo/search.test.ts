import { beforeEach, describe, expect, it } from "vitest";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("searchCandidates", () => {
  it("finds a node by a title prefix match", () => {
    const node = newNodeInput({ type: "todo", title: "Buy milk", notes: "" });
    repo.insert(node);

    expect(repo.searchCandidates("mil").map((r) => r.id)).toContain(node.id);
  });

  it("finds a node by a notes match", () => {
    const node = newNodeInput({ type: "todo", title: "Groceries", notes: "get oat milk" });
    repo.insert(node);

    expect(repo.searchCandidates("oat").map((r) => r.id)).toContain(node.id);
  });

  it("stays in sync when a title is updated", () => {
    const node = newNodeInput({ type: "todo", title: "Buy milk", notes: "" });
    repo.insert(node);

    repo.updateTitle(node.id, "Buy oat milk", "2024-01-01T00:00:00.000Z");

    expect(repo.searchCandidates("oat").map((r) => r.id)).toContain(node.id);
  });

  it("stays in sync when a node is hard-deleted", () => {
    const node = newNodeInput({ type: "todo", title: "Buy milk", notes: "" });
    repo.insert(node);
    repo.hardDelete(node.id);

    expect(repo.searchCandidates("milk").map((r) => r.id)).not.toContain(node.id);
  });

  it("still indexes a trashed node (filtering trashed results is the query layer's job)", () => {
    const node = newNodeInput({ type: "todo", title: "Buy milk", notes: "" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    expect(repo.searchCandidates("milk").map((r) => r.id)).toContain(node.id);
  });

  it("returns an empty array for an empty query", () => {
    expect(repo.searchCandidates("")).toEqual([]);
  });

  it("does not throw on FTS5 special characters in the query (e.g. an apostrophe)", () => {
    const node = newNodeInput({ type: "todo", title: "Don't forget milk", notes: "" });
    repo.insert(node);

    expect(() => repo.searchCandidates("don't")).not.toThrow();
  });
});
