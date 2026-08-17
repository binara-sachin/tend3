import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { EmptyTrash } from "../../commands/EmptyTrash.js";
import { NotInvertibleError } from "../../commands/NotInvertibleError.js";
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

describe("EmptyTrash.apply", () => {
  it("hard-deletes every trash root's full subtree, including untrashed descendants", () => {
    const trashedRoot = newNodeInput({ type: "project" });
    repo.insert(trashedRoot);
    const heading = newNodeInput({ type: "heading", parentId: trashedRoot.id });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id });
    repo.insert(todo);
    repo.updateDeletedAt(trashedRoot.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const untouched = newNodeInput({ type: "project" });
    repo.insert(untouched);

    new EmptyTrash().apply(ctx);

    expect(repo.getById(trashedRoot.id)).toBeNull();
    expect(repo.getById(heading.id)).toBeNull();
    expect(repo.getById(todo.id)).toBeNull();
    expect(repo.getById(untouched.id)).not.toBeNull();
  });

  it("purges a separately-trashed descendant's subtree exactly once, without error", () => {
    const trashedRoot = newNodeInput({ type: "project" });
    repo.insert(trashedRoot);
    const separatelyTrashedChild = newNodeInput({ type: "project", parentId: trashedRoot.id });
    repo.insert(separatelyTrashedChild);
    const grandchild = newNodeInput({ type: "todo", parentId: separatelyTrashedChild.id });
    repo.insert(grandchild);
    repo.updateDeletedAt(
      separatelyTrashedChild.id,
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z",
    );
    repo.updateDeletedAt(trashedRoot.id, "2024-02-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");

    expect(() => new EmptyTrash().apply(ctx)).not.toThrow();

    expect(repo.getById(trashedRoot.id)).toBeNull();
    expect(repo.getById(separatelyTrashedChild.id)).toBeNull();
    expect(repo.getById(grandchild.id)).toBeNull();
  });

  it("is a no-op when there is nothing in the trash", () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    expect(() => new EmptyTrash().apply(ctx)).not.toThrow();
    expect(repo.getById(node.id)).not.toBeNull();
  });
});

describe("EmptyTrash.invert", () => {
  it("throws NotInvertibleError — EmptyTrash is irreversible per spec 7.3", () => {
    expect(() => new EmptyTrash().invert()).toThrow(NotInvertibleError);
  });
});
