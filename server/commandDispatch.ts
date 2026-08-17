import type { Command, CommandContext } from "../commands/Command.js";
import { CreateNode } from "../commands/CreateNode.js";
import { RenameNode } from "../commands/RenameNode.js";
import { SetCompleted } from "../commands/SetCompleted.js";
import { SetDeadline } from "../commands/SetDeadline.js";
import { SetNotes } from "../commands/SetNotes.js";
import { SetWhen } from "../commands/SetWhen.js";
import { TrashNode } from "../commands/TrashNode.js";
import type { NodeType } from "../repo/types.js";

/**
 * Commands exposed over HTTP this phase. MoveNode (reparenting is drag-and-drop's
 * job), RestoreNode/EmptyTrash (Trash view), and HardDeleteNode (an inverse only,
 * never issued directly) are deliberately not reachable here.
 */
export interface DispatchedCommand {
  command: Command;
  /** The node the caller should re-fetch after apply() to see the result. */
  nodeId: string;
}

export function buildCommand(ctx: CommandContext, type: string, payload: unknown): DispatchedCommand {
  const p = payload as Record<string, unknown>;

  switch (type) {
    case "CreateNode": {
      const id = ctx.genId();
      return {
        nodeId: id,
        command: new CreateNode({
          id,
          parentId: (p.parentId as string | null) ?? null,
          type: p.type as NodeType,
          title: (p.title as string) ?? "",
          notes: (p.notes as string) ?? "",
          sortKey: p.sortKey as string,
          whenDate: (p.whenDate as string | null) ?? null,
          deadline: (p.deadline as string | null) ?? null,
        }),
      };
    }
    case "RenameNode":
      return { nodeId: p.nodeId as string, command: new RenameNode(p.nodeId as string, p.title as string) };
    case "SetNotes":
      return { nodeId: p.nodeId as string, command: new SetNotes(p.nodeId as string, p.notes as string) };
    case "SetWhen":
      return {
        nodeId: p.nodeId as string,
        command: new SetWhen(p.nodeId as string, (p.whenDate as string | null) ?? null),
      };
    case "SetDeadline":
      return {
        nodeId: p.nodeId as string,
        command: new SetDeadline(p.nodeId as string, (p.deadline as string | null) ?? null),
      };
    case "SetCompleted":
      // completedAt is server time when completing, never client-supplied (spec 7.5).
      return {
        nodeId: p.nodeId as string,
        command: new SetCompleted(p.nodeId as string, p.completed ? ctx.now() : null),
      };
    case "TrashNode":
      // deletedAt is server time, never client-supplied (spec 7.5: server is the source of truth).
      return {
        nodeId: p.nodeId as string,
        command: new TrashNode(p.nodeId as string, ctx.now()),
      };
    default:
      throw new Error(`Command type '${type}' is not exposed over HTTP`);
  }
}
