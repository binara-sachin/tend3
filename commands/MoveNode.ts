import type { Command, CommandContext } from "./Command.js";

export class MoveNode implements Command {
  readonly type = "MoveNode";

  private priorParentId?: string | null;
  private priorSortKey?: string;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly newParentId: string | null,
    private readonly newSortKey: string,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`MoveNode: node ${this.nodeId} not found`);
    }
    if (node.isSystem) {
      throw new Error("MoveNode: cannot move the Inbox");
    }
    if (this.newParentId === this.nodeId) {
      throw new Error("MoveNode: a node cannot be moved into itself");
    }

    if (this.newParentId === null) {
      if (node.type !== "project") {
        throw new Error("MoveNode: root nodes must be type 'project'");
      }
    } else {
      const newParent = ctx.repo.getById(this.newParentId);
      if (!newParent) {
        throw new Error(`MoveNode: parent ${this.newParentId} not found`);
      }
      if (newParent.type === "todo") {
        throw new Error("MoveNode: a todo cannot have children");
      }
      if (node.type === "heading" && newParent.type !== "project") {
        throw new Error("MoveNode: a heading's parent must be a project");
      }
      if (ctx.repo.isDescendantOf(this.newParentId, this.nodeId)) {
        throw new Error("MoveNode: cannot move a node into its own descendant");
      }
    }

    this.priorParentId = node.parentId;
    this.priorSortKey = node.sortKey;
    this.priorUpdatedAt = node.updatedAt;

    const isNodeItselfLive = node.deletedAt === null;
    const isOwnOpenTodo = isNodeItselfLive && node.type === "todo" && node.completedAt === null;
    const contribution = isNodeItselfLive
      ? (isOwnOpenTodo ? 1 : 0) + ctx.repo.countLiveOpenTodosInSubtree(this.nodeId)
      : 0;

    const oldAncestorProjectIds = ctx.repo.getAncestorProjectIds(this.nodeId);

    ctx.repo.updateParentAndSortKey(
      this.nodeId,
      this.newParentId,
      this.newSortKey,
      this.updatedAtOverride ?? ctx.now(),
    );

    if (contribution !== 0) {
      const newAncestorProjectIds = ctx.repo.getAncestorProjectIds(this.nodeId);
      ctx.repo.adjustOpenDescendantCount(oldAncestorProjectIds, -contribution);
      ctx.repo.adjustOpenDescendantCount(newAncestorProjectIds, contribution);
    }
  }

  invert(): Command {
    if (
      this.priorParentId === undefined ||
      this.priorSortKey === undefined ||
      this.priorUpdatedAt === undefined
    ) {
      throw new Error("MoveNode: invert() called before apply()");
    }
    return new MoveNode(this.nodeId, this.priorParentId, this.priorSortKey, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return {
      nodeId: this.nodeId,
      newParentId: this.newParentId,
      newSortKey: this.newSortKey,
    };
  }
}
