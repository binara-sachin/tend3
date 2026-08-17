import type { Command, CommandContext } from "./Command.js";
import { RestoreNode } from "./RestoreNode.js";

export class TrashNode implements Command {
  readonly type = "TrashNode";

  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly deletedAt: string,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`TrashNode: node ${this.nodeId} not found`);
    }
    if (node.isSystem) {
      throw new Error("TrashNode: cannot trash the Inbox");
    }
    if (node.deletedAt !== null) {
      throw new Error("TrashNode: node is already trashed");
    }

    this.priorUpdatedAt = node.updatedAt;

    const isOwnOpenTodo = node.type === "todo" && node.completedAt === null;
    const contribution =
      (isOwnOpenTodo ? 1 : 0) + ctx.repo.countLiveOpenTodosInSubtree(this.nodeId);
    const ancestorProjectIds = ctx.repo.getAncestorProjectIds(this.nodeId);

    ctx.repo.updateDeletedAt(this.nodeId, this.deletedAt, this.updatedAtOverride ?? ctx.now());

    if (contribution !== 0) {
      ctx.repo.adjustOpenDescendantCount(ancestorProjectIds, -contribution);
    }
  }

  invert(): Command {
    if (this.priorUpdatedAt === undefined) {
      throw new Error("TrashNode: invert() called before apply()");
    }
    return new RestoreNode(this.nodeId, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, deletedAt: this.deletedAt };
  }
}
