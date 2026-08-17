import type { Command, CommandContext } from "./Command.js";

export class RenameNode implements Command {
  readonly type = "RenameNode";

  private priorTitle?: string;
  private priorUpdatedAt?: string;

  constructor(
    private readonly nodeId: string,
    private readonly title: string,
    private readonly updatedAtOverride?: string,
  ) {}

  apply(ctx: CommandContext): void {
    const node = ctx.repo.getById(this.nodeId);
    if (!node) {
      throw new Error(`RenameNode: node ${this.nodeId} not found`);
    }
    if (node.isSystem) {
      throw new Error("RenameNode: cannot rename the Inbox");
    }

    this.priorTitle = node.title;
    this.priorUpdatedAt = node.updatedAt;

    ctx.repo.updateTitle(this.nodeId, this.title, this.updatedAtOverride ?? ctx.now());
  }

  invert(): Command {
    if (this.priorTitle === undefined || this.priorUpdatedAt === undefined) {
      throw new Error("RenameNode: invert() called before apply()");
    }
    return new RenameNode(this.nodeId, this.priorTitle, this.priorUpdatedAt);
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId, title: this.title };
  }
}
