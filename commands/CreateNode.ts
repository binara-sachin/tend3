import { isValidSortKey } from "../lib/sortKey.js";
import type { NodeType } from "../repo/types.js";
import type { Command, CommandContext } from "./Command.js";
import { HardDeleteNode } from "./HardDeleteNode.js";

export interface CreateNodeInput {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  notes: string;
  sortKey: string;
  whenDate: string | null;
  deadline: string | null;
  /**
   * Overrides for created_at/updated_at. Omitted for a genuine new creation
   * (stamped with ctx.now()); supplied by HardDeleteNode.invert() to
   * reconstruct a just-deleted node exactly, timestamps included.
   */
  createdAt?: string;
  updatedAt?: string;
}

export class CreateNode implements Command {
  readonly type = "CreateNode";

  constructor(private readonly input: CreateNodeInput) {}

  apply(ctx: CommandContext): void {
    const { id, parentId, type } = this.input;

    if (parentId === null) {
      if (type !== "project") {
        throw new Error("CreateNode: root nodes must be type 'project'");
      }
    } else {
      const parent = ctx.repo.getById(parentId);
      if (!parent) {
        throw new Error(`CreateNode: parent ${parentId} not found`);
      }
      if (parent.type === "todo") {
        throw new Error("CreateNode: a todo cannot have children");
      }
      if (type === "heading" && parent.type !== "project") {
        throw new Error("CreateNode: a heading's parent must be a project");
      }
    }

    if (this.input.title.trim() === "") {
      throw new Error("CreateNode: title must not be blank");
    }

    // A malformed sortKey would permanently break fractional-indexing for
    // every future sibling inserted after it, however it got in — reject it
    // here so no caller (UI or otherwise) can write one.
    if (!isValidSortKey(this.input.sortKey)) {
      throw new Error(`CreateNode: sortKey '${this.input.sortKey}' is not a valid order key`);
    }

    const now = ctx.now();
    ctx.repo.insert({
      id,
      parentId,
      type,
      title: this.input.title,
      notes: this.input.notes,
      sortKey: this.input.sortKey,
      whenDate: this.input.whenDate,
      deadline: this.input.deadline,
      createdAt: this.input.createdAt ?? now,
      updatedAt: this.input.updatedAt ?? now,
    });

    if (type === "todo") {
      ctx.repo.adjustOpenDescendantCount(ctx.repo.getAncestorProjectIds(id), 1);
    }
  }

  invert(): Command {
    return new HardDeleteNode(this.input.id);
  }

  toPayload(): Record<string, unknown> {
    return { ...this.input };
  }
}
