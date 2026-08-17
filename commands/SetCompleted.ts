import type { Command, CommandContext } from "./Command.js";

export class SetCompleted implements Command {
  readonly type = "SetCompleted";

  private priorCompletedAt?: string | null;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly completedAt: string | null,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`SetCompleted: node ${this.nodeId} not found`);
    }
    if (node.type !== "todo") {
      throw new Error("SetCompleted: only todos are completable");
    }

    this.priorCompletedAt = node.completedAt;
    this.priorUpdatedAt = node.updatedAt;

    const wasOpen = node.completedAt === null && node.deletedAt === null;
    const willBeOpen = this.completedAt === null && node.deletedAt === null;

    ctx.repo.updateCompletedAt(
      this.nodeId,
      this.completedAt,
      this.updatedAtOverride ?? ctx.now(),
    );

    if (wasOpen !== willBeOpen) {
      const delta = willBeOpen ? 1 : -1;
      ctx.repo.adjustOpenDescendantCount(ctx.repo.getAncestorProjectIds(this.nodeId), delta);
    }
  }

  invert(): Command {
    if (this.priorCompletedAt === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("SetCompleted: invert() called before apply()");
    }
    return new SetCompleted(this.nodeId, this.priorCompletedAt, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, completedAt: this.completedAt };
  }
}
