import type { Command, CommandContext } from "./Command.js";

export class SetWhen implements Command {
  readonly type = "SetWhen";

  private priorWhenDate?: string | null;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly whenDate: string | null,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`SetWhen: node ${this.nodeId} not found`);
    }
    if (node.type === "heading") {
      throw new Error("SetWhen: headings have no dates");
    }

    this.priorWhenDate = node.whenDate;
    this.priorUpdatedAt = node.updatedAt;

    ctx.repo.updateWhenDate(this.nodeId, this.whenDate, this.updatedAtOverride ?? ctx.now());
  }

  invert(): Command {
    if (this.priorWhenDate === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("SetWhen: invert() called before apply()");
    }
    return new SetWhen(this.nodeId, this.priorWhenDate, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, whenDate: this.whenDate };
  }
}
