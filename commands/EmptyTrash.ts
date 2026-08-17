import type { Command, CommandContext } from "./Command.js";
import { NotInvertibleError } from "./NotInvertibleError.js";

export class EmptyTrash implements Command {
  readonly type = "EmptyTrash";

  apply(ctx: CommandContext): void {
    for (const root of ctx.repo.getTrashRoots()) {
      ctx.repo.hardDeleteSubtree(root.id);
    }
  }

  invert(): Command {
    throw new NotInvertibleError(
      "EmptyTrash is irreversible (spec 7.3) — confirm with the user before applying it.",
    );
  }

  toPayload(): Record<string, unknown> {
    return {};
  }
}
