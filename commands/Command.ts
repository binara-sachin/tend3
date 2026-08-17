import type { Clock } from "../lib/clock.js";
import type { NodeRepository } from "../repo/NodeRepository.js";

export interface CommandContext {
  repo: NodeRepository;
  now: Clock;
  genId: () => string;
}

export interface Command {
  readonly type: string;
  apply(ctx: CommandContext): void;
  /** Only valid to call after apply() has run on this instance. */
  invert(): Command;
  toPayload(): Record<string, unknown>;
}
