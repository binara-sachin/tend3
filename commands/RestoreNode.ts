import type { Command, CommandContext } from "./Command.js";
import { TrashNode } from "./TrashNode.js";

export class RestoreNode implements Command {
  readonly type = "RestoreNode";

  private priorDeletedAt?: string;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`RestoreNode: node ${this.nodeId} not found`);
    }
    if (node.deletedAt === null) {
      throw new Error("RestoreNode: node is not trashed");
    }

    this.priorDeletedAt = node.deletedAt;
    this.priorUpdatedAt = node.updatedAt;

    const isOwnOpenTodo = node.type === "todo" && node.completedAt === null;
    const contribution =
      (isOwnOpenTodo ? 1 : 0) + ctx.repo.countLiveOpenTodosInSubtree(this.nodeId);
    const ancestorProjectIds = ctx.repo.getAncestorProjectIds(this.nodeId);

    ctx.repo.updateDeletedAt(this.nodeId, null, this.updatedAtOverride ?? ctx.now());

    if (contribution !== 0) {
      ctx.repo.adjustOpenDescendantCount(ancestorProjectIds, contribution);
    }
  }

  invert(): Command {
    if (this.priorDeletedAt === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("RestoreNode: invert() called before apply()");
    }
    return new TrashNode(this.nodeId, this.priorDeletedAt, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId };
  }
}
