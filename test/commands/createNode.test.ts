import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreateNode } from "../../commands/CreateNode.js";
import type { CommandContext } from "../../commands/Command.js";
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

describe("CreateNode.apply", () => {
  it("creates a root project", () => {
    const id = generateId();
    const command = new CreateNode({
      id,
      parentId: null,
      type: "project",
      title: "Areas",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    command.apply(ctx);

    const row = repo.getById(id);
    expect(row?.type).toBe("project");
    expect(row?.title).toBe("Areas");
    expect(row?.parentId).toBeNull();
    expect(row?.createdAt).toBe("2024-06-01T00:00:00.000Z");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("increments ancestor project counts when creating an open todo", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todoId = generateId();

    new CreateNode({
      id: todoId,
      parentId: root.id,
      type: "todo",
      title: "Buy milk",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    }).apply(ctx);

    expect(repo.getById(root.id)?.openDescendantCount).toBe(1);
  });

  it("does not adjust ancestor counts when creating a project or heading", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    new CreateNode({
      id: generateId(),
      parentId: root.id,
      type: "heading",
      title: "Later",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    }).apply(ctx);

    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });

  it("rejects a root node that isn't a project", () => {
    const command = new CreateNode({
      id: generateId(),
      parentId: null,
      type: "todo",
      title: "",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    expect(() => command.apply(ctx)).toThrow(/root/i);
  });

  it("rejects a heading whose parent is not a project", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);

    const command = new CreateNode({
      id: generateId(),
      parentId: heading.id,
      type: "heading",
      title: "",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    expect(() => command.apply(ctx)).toThrow(/heading/i);
  });

  it("rejects creating any node under a todo parent", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);
    repo.adjustOpenDescendantCount([root.id], 1);

    const command = new CreateNode({
      id: generateId(),
      parentId: todo.id,
      type: "todo",
      title: "",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    expect(() => command.apply(ctx)).toThrow(/todo/i);
  });

  it("rejects a blank title", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    const command = new CreateNode({
      id: generateId(),
      parentId: root.id,
      type: "todo",
      title: "   ",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    expect(() => command.apply(ctx)).toThrow(/title/i);
  });

  it("rejects creating under a missing parent", () => {
    const command = new CreateNode({
      id: generateId(),
      parentId: "missing",
      type: "todo",
      title: "",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    expect(() => command.apply(ctx)).toThrow(/not found/i);
  });
});

describe("CreateNode.invert", () => {
  it("returns a HardDeleteNode that removes the created node and decrements ancestor counts", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const command = new CreateNode({
      id: generateId(),
      parentId: root.id,
      type: "todo",
      title: "Buy milk",
      notes: "",
      sortKey: "a0",
      whenDate: null,
      deadline: null,
    });

    command.apply(ctx);
    const createdId = repo.getChildren(root.id)[0]?.id;
    expect(createdId).toBeDefined();

    command.invert().apply(ctx);

    expect(repo.getById(createdId as string)).toBeNull();
    expect(repo.getById(root.id)?.openDescendantCount).toBe(0);
  });
});
