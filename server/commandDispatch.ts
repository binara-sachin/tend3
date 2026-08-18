import type { Command, CommandContext } from "../commands/Command.js";
import { CreateNode } from "../commands/CreateNode.js";
import { EmptyTrash } from "../commands/EmptyTrash.js";
import { MoveNode } from "../commands/MoveNode.js";
import { PurgeNode } from "../commands/PurgeNode.js";
import { RenameNode } from "../commands/RenameNode.js";
import { RestoreNode } from "../commands/RestoreNode.js";
import { SetCompleted } from "../commands/SetCompleted.js";
import { SetDeadline } from "../commands/SetDeadline.js";
import { SetNotes } from "../commands/SetNotes.js";
import { SetWhen } from "../commands/SetWhen.js";
import { TrashNode } from "../commands/TrashNode.js";
import type { NodeType } from "../repo/types.js";

/**
 * Commands exposed over HTTP this phase. HardDeleteNode (an inverse only,
 * never issued directly) is deliberately not reachable here.
 */
export interface DispatchedCommand {
  command: Command;
  /** The node the caller should re-fetch after apply() to see the result, or null for a command with no single subject node. */
  nodeId: string | null;
  /** Parent whose children may now need rebalancing (null: no check needed — e.g. root-level, or unaffected). */
  affectedParentId: string | null;
}

export function buildCommand(ctx: CommandContext, type: string, payload: unknown): DispatchedCommand {
  const p = payload as Record<string, unknown>;

  switch (type) {
    case "CreateNode": {
      const id = ctx.genId();
      const parentId = (p.parentId as string | null) ?? null;
      return {
        nodeId: id,
        affectedParentId: parentId,
        command: new CreateNode({
          id,
          parentId,
          type: p.type as NodeType,
          title: (p.title as string) ?? "",
          notes: (p.notes as string) ?? "",
          sortKey: p.sortKey as string,
          whenDate: (p.whenDate as string | null) ?? null,
          deadline: (p.deadline as string | null) ?? null,
        }),
      };
    }
    case "MoveNode": {
      const newParentId = (p.newParentId as string | null) ?? null;
      return {
        nodeId: p.nodeId as string,
        affectedParentId: newParentId,
        command: new MoveNode(p.nodeId as string, newParentId, p.newSortKey as string),
      };
    }
    case "RenameNode":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new RenameNode(p.nodeId as string, p.title as string),
      };
    case "SetNotes":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new SetNotes(p.nodeId as string, p.notes as string),
      };
    case "SetWhen":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new SetWhen(p.nodeId as string, (p.whenDate as string | null) ?? null),
      };
    case "SetDeadline":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new SetDeadline(p.nodeId as string, (p.deadline as string | null) ?? null),
      };
    case "SetCompleted":
      // completedAt is server time when completing, never client-supplied (spec 7.5).
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new SetCompleted(p.nodeId as string, p.completed ? ctx.now() : null),
      };
    case "TrashNode":
      // deletedAt is server time, never client-supplied (spec 7.5: server is the source of truth).
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new TrashNode(p.nodeId as string, ctx.now()),
      };
    case "RestoreNode":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new RestoreNode(p.nodeId as string),
      };
    case "EmptyTrash":
      return {
        nodeId: null,
        affectedParentId: null,
        command: new EmptyTrash(),
      };
    case "PurgeNode":
      return {
        nodeId: p.nodeId as string,
        affectedParentId: null,
        command: new PurgeNode(p.nodeId as string),
      };
    default:
      throw new Error(`Command type '${type}' is not exposed over HTTP`);
  }
}
