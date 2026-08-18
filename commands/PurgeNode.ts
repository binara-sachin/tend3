import type { Command, CommandContext } from "./Command.js";
import { NotInvertibleError } from "./NotInvertibleError.js";

export class PurgeNode implements Command {
  readonly type = "PurgeNode";

  constructor(private readonly nodeId: string) {}

  apply(ctx: CommandContext): void {
    const isTrashRoot = ctx.repo.getTrashRoots().some((root) => root.id === this.nodeId);
    if (!isTrashRoot) {
      throw new Error(
        "PurgeNode: node is not a trash root (spec 3.6 — a trashed descendant of an " +
          "already-trashed ancestor isn't an independent purge target)",
      );
    }
    ctx.repo.hardDeleteSubtree(this.nodeId);
  }

  invert(): Command {
    throw new NotInvertibleError(
      "PurgeNode is irreversible (spec 7.3, same as EmptyTrash) — confirm with the user before applying it.",
    );
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeId };
  }
}
