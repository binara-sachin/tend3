import { evenlySpacedKeys } from "../lib/sortKey.js";
import type { Command, CommandContext } from "./Command.js";

interface KeyedSortKey {
  id: string;
  sortKey: string;
  updatedAt: string;
}

/** Sets an explicit set of (id, sortKey, updatedAt); its inverse is the same operation with the two keysets swapped. */
class SetSortKeys implements Command {
  readonly type = "SetSortKeys";

  constructor(
    private readonly targetKeys: KeyedSortKey[],
    private readonly inverseKeys: KeyedSortKey[],
  ) {}

  apply(ctx: CommandContext): void {
    for (const { id, sortKey, updatedAt } of this.targetKeys) {
      ctx.repo.updateSortKey(id, sortKey, updatedAt);
    }
  }

  invert(): Command {
    return new SetSortKeys(this.inverseKeys, this.targetKeys);
  }

  toPayload(): Record<string, unknown> {
    return { keys: this.targetKeys };
  }
}

export class Rebalance implements Command {
  readonly type = "Rebalance";

  private priorKeys?: KeyedSortKey[];
  private newKeys?: KeyedSortKey[];

  constructor(private readonly parentId: string) {}

  apply(ctx: CommandContext): void {
    const children = ctx.repo.getChildren(this.parentId);
    this.priorKeys = children.map((c) => ({
      id: c.id,
      sortKey: c.sortKey,
      updatedAt: c.updatedAt,
    }));

    const now = ctx.now();
    const generated = evenlySpacedKeys(children.length);
    this.newKeys = children.map((c, i) => ({
      id: c.id,
      sortKey: generated[i] as string,
      updatedAt: now,
    }));
    for (const { id, sortKey, updatedAt } of this.newKeys) {
      ctx.repo.updateSortKey(id, sortKey, updatedAt);
    }
  }

  invert(): Command {
    if (!this.priorKeys || !this.newKeys) {
      throw new Error("Rebalance: invert() called before apply()");
    }
    return new SetSortKeys(this.priorKeys, this.newKeys);
  }

  toPayload(): Record<string, unknown> {
    return { parentId: this.parentId };
  }
}
