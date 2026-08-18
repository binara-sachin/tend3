import { beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { NotInvertibleError } from "../../commands/NotInvertibleError.js";
import { PurgeNode } from "../../commands/PurgeNode.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;
let ctx: CommandContext;

beforeEach(() => {
  ({ repo } = createTestRepo());
  ctx = { repo, now: fixedClock("2024-06-01T00:00:00.000Z"), genId: generateId };
});

describe("PurgeNode.apply", () => {
  it("hard-deletes a trash root's whole subtree", () => {
    const trashedRoot = newNodeInput({ type: "project" });
    repo.insert(trashedRoot);
    const todo = newNodeInput({ type: "todo", parentId: trashedRoot.id });
    repo.insert(todo);
    repo.updateDeletedAt(trashedRoot.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    new PurgeNode(trashedRoot.id).apply(ctx);

    expect(repo.getById(trashedRoot.id)).toBeNull();
    expect(repo.getById(todo.id)).toBeNull();
  });

  it("throws when the node is not trashed", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    expect(() => new PurgeNode(node.id).apply(ctx)).toThrow();
    expect(repo.getById(node.id)).not.toBeNull();
  });

  it("throws when the node is trashed but not itself a root (its ancestor is already trashed)", () => {
    const trashedRoot = newNodeInput({ type: "project" });
    repo.insert(trashedRoot);
    const separatelyTrashedChild = newNodeInput({ type: "project", parentId: trashedRoot.id });
    repo.insert(separatelyTrashedChild);
    repo.updateDeletedAt(
      separatelyTrashedChild.id,
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z",
    );
    repo.updateDeletedAt(trashedRoot.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    expect(() => new PurgeNode(separatelyTrashedChild.id).apply(ctx)).toThrow();
    expect(repo.getById(separatelyTrashedChild.id)).not.toBeNull();
  });
});

describe("PurgeNode.invert", () => {
  it("throws NotInvertibleError — PurgeNode is irreversible, same as EmptyTrash", () => {
    expect(() => new PurgeNode("some-id").invert()).toThrow(NotInvertibleError);
  });
});
