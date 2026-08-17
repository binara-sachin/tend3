import type { Command, CommandContext } from "./Command.js";

export class SetDeadline implements Command {
  readonly type = "SetDeadline";

  private priorDeadline?: string | null;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly deadline: string | null,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`SetDeadline: node ${this.nodeId} not found`);
    }
    if (node.type === "heading") {
      throw new Error("SetDeadline: headings have no dates");
    }

    this.priorDeadline = node.deadline;
    this.priorUpdatedAt = node.updatedAt;

    ctx.repo.updateDeadline(this.nodeId, this.deadline, this.updatedAtOverride ?? ctx.now());
  }

  invert(): Command {
    if (this.priorDeadline === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("SetDeadline: invert() called before apply()");
    }
    return new SetDeadline(this.nodeId, this.priorDeadline, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, deadline: this.deadline };
  }
}
