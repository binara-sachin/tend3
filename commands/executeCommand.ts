import type { CommandLogRepository } from "../repo/CommandLogRepository.js";
import type { Command, CommandContext } from "./Command.js";

export function executeCommand(
  command: Command,
  ctx: CommandContext,
  commandLog: CommandLogRepository,
): void {
  ctx.repo.transaction(() => {
    command.apply(ctx);
    commandLog.append(command.type, JSON.stringify(command.toPayload()), ctx.now());
  });
}
