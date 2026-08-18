import type { Command, CommandContext } from "../commands/Command.js";
import { executeCommand } from "../commands/executeCommand.js";
import { NotInvertibleError } from "../commands/NotInvertibleError.js";
import type { CommandLogRepository } from "../repo/CommandLogRepository.js";

export interface UndoStack {
  push(command: Command): void;
  undo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
  redo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
}

/**
 * Lives in server memory only (spec 7.4) — a fresh instance per createApp()
 * call, not a module-level singleton, so tests never leak undo state across
 * app instances.
 */
export function createUndoStack(): UndoStack {
  const undoEntries: Command[] = [];
  const redoEntries: Command[] = [];

  return {
    push(command) {
      try {
        command.invert();
      } catch (err) {
        if (err instanceof NotInvertibleError) {
          undoEntries.length = 0;
          redoEntries.length = 0;
          return;
        }
        throw err;
      }
      undoEntries.push(command);
      redoEntries.length = 0;
    },

    undo(ctx, commandLog) {
      const command = undoEntries.pop();
      if (!command) return false;
      executeCommand(command.invert(), ctx, commandLog);
      redoEntries.push(command);
      return true;
    },

    redo(ctx, commandLog) {
      const command = redoEntries.pop();
      if (!command) return false;
      executeCommand(command, ctx, commandLog);
      undoEntries.push(command);
      return true;
    },
  };
}
