import type { Command, CommandContext } from "./Command.js";

export class SetNotes implements Command {
  readonly type = "SetNotes";

  private priorNotes?: string;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly notes: string,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`SetNotes: node ${this.nodeId} not found`);
    }

    this.priorNotes = node.notes;
    this.priorUpdatedAt = node.updatedAt;

    ctx.repo.updateNotes(this.nodeId, this.notes, this.updatedAtOverride ?? ctx.now());
  }

  invert(): Command {
    if (this.priorNotes === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("SetNotes: invert() called before apply()");
    }
    return new SetNotes(this.nodeId, this.priorNotes, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, notes: this.notes };
  }
}
