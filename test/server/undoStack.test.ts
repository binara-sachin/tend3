import { beforeEach, describe, expect, it } from "vitest";
import { createUndoStack, type UndoStack } from "../../server/undoStack.js";
import type { CommandContext } from "../../commands/Command.js";
import { EmptyTrash } from "../../commands/EmptyTrash.js";
import { executeCommand } from "../../commands/executeCommand.js";
import { RenameNode } from "../../commands/RenameNode.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { SqliteCommandLogRepository } from "../../repo/SqliteCommandLogRepository.js";
import type { CommandLogRepository } from "../../repo/CommandLogRepository.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;
let ctx: CommandContext;
let commandLog: CommandLogRepository;
let stack: UndoStack;

beforeEach(() => {
  const created = createTestRepo();
  repo = created.repo;
  ctx = { repo, now: fixedClock("2024-06-01T00:00:00.000Z"), genId: generateId };
  commandLog = new SqliteCommandLogRepository(created.db);
  stack = createUndoStack();
});

describe("createUndoStack", () => {
  it("undo() reverses the last pushed command", () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);
    const rename = new RenameNode(node.id, "new");
    executeCommand(rename, ctx, commandLog);
    stack.push(rename);

    const undone = stack.undo(ctx, commandLog);

    expect(undone).toBe(true);
    expect(repo.getById(node.id)?.title).toBe("old");
  });

  it("redo() re-applies the command undo just reversed", () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);
    const rename = new RenameNode(node.id, "new");
    executeCommand(rename, ctx, commandLog);
    stack.push(rename);
    stack.undo(ctx, commandLog);

    const redone = stack.redo(ctx, commandLog);

    expect(redone).toBe(true);
    expect(repo.getById(node.id)?.title).toBe("new");
  });

  it("undo() on an empty stack returns false and changes nothing", () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);

    const undone = stack.undo(ctx, commandLog);

    expect(undone).toBe(false);
    expect(repo.getById(node.id)?.title).toBe("old");
  });

  it("redo() on an empty stack returns false and changes nothing", () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);

    const redone = stack.redo(ctx, commandLog);

    expect(redone).toBe(false);
    expect(repo.getById(node.id)?.title).toBe("old");
  });

  it("a fresh push clears any pending redo entry", () => {
    const node = newNodeInput({ type: "todo", title: "a" });
    repo.insert(node);
    const rename1 = new RenameNode(node.id, "b");
    executeCommand(rename1, ctx, commandLog);
    stack.push(rename1);
    stack.undo(ctx, commandLog); // title back to "a"; redo stack now holds rename1

    const rename2 = new RenameNode(node.id, "c");
    executeCommand(rename2, ctx, commandLog);
    stack.push(rename2);

    const redone = stack.redo(ctx, commandLog);

    expect(redone).toBe(false);
    expect(repo.getById(node.id)?.title).toBe("c");
  });

  it("pushing an irreversible command clears both stacks", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const rename = new RenameNode(project.id, "renamed");
    executeCommand(rename, ctx, commandLog);
    stack.push(rename);

    const emptyTrash = new EmptyTrash();
    executeCommand(emptyTrash, ctx, commandLog);
    stack.push(emptyTrash);

    expect(stack.undo(ctx, commandLog)).toBe(false);
    expect(stack.redo(ctx, commandLog)).toBe(false);
  });
});
