import type { NodeRow } from "../repo/types.js";
import type { Command, CommandContext } from "./Command.js";
import { CreateNode } from "./CreateNode.js";

export class HardDeleteNode implements Command {
  readonly type = "HardDeleteNode";

  private snapshot?: NodeRow;

  constructor(private readonly nodeId: string) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`HardDeleteNode: node ${this.nodeId} not found`);
    }
    if (ctx.repo.getChildren(this.nodeId).length > 0) {
      throw new Error("HardDeleteNode: cannot delete a node with children");
    }
    this.snapshot = node;

    const wasOpenTodo =
      node.type === "todo" && node.completedAt === null && node.deletedAt === null;
    const ancestorProjectIds = ctx.repo.getAncestorProjectIds(this.nodeId);

    ctx.repo.hardDelete(this.nodeId);

    if (wasOpenTodo) {
      ctx.repo.adjustOpenDescendantCount(ancestorProjectIds, -1);
    }
  }

  invert(): Command {
    if (!this.snapshot) {
      throw new Error("HardDeleteNode: invert() called before apply()");
    }
    if (this.snapshot.completedAt !== null || this.snapshot.deletedAt !== null) {
      throw new Error(
        "HardDeleteNode: cannot invert deletion of a completed or trashed node via CreateNode",
      );
    }
    return new CreateNode({
      id: this.snapshot.id,
      parentId: this.snapshot.parentId,
      type: this.snapshot.type,
      title: this.snapshot.title,
      notes: this.snapshot.notes,
      sortKey: this.snapshot.sortKey,
      whenDate: this.snapshot.whenDate,
      deadline: this.snapshot.deadline,
      createdAt: this.snapshot.createdAt,
      updatedAt: this.snapshot.updatedAt,
    });
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId };
  }
}
