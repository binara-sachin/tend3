import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import type { Command, CommandContext } from "../../commands/Command.js";
import { executeCommand } from "../../commands/executeCommand.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { SqliteCommandLogRepository } from "../../repo/SqliteCommandLogRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let ctx: CommandContext;
let db: Database.Database;
let commandLog: SqliteCommandLogRepository;

beforeEach(() => {
  const created = createTestRepo();
  db = created.db;
  ctx = {
    repo: created.repo,
    now: fixedClock("2024-03-01T00:00:00.000Z"),
    genId: generateId,
  };
  commandLog = new SqliteCommandLogRepository(db);
});

function commandLogRows() {
  return db.prepare("SELECT * FROM command_log").all() as Array<{
    command: string;
    payload: string;
    applied_at: string;
  }>;
}

/** Test-only stand-in for a real command — none exist yet at this point in the build. */
class FakeCommand implements Command {
  readonly type = "FakeCommand";

  constructor(
    private readonly nodeInput: ReturnType<typeof newNodeInput>,
    private readonly shouldThrow = false,
  ) {}

  apply(applyCtx: CommandContext): void {
    applyCtx.repo.insert(this.nodeInput);
    if (this.shouldThrow) throw new Error("boom");
  }

  invert(): Command {
    throw new Error("not needed for this test");
  }

  toPayload(): Record<string, unknown> {
    return { nodeId: this.nodeInput.id };
  }
}

describe("executeCommand", () => {
  it("runs apply() and appends exactly one command_log row", () => {
    const node = newNodeInput({ type: "project" });
    const command = new FakeCommand(node);

    executeCommand(command, ctx, commandLog);

    expect(ctx.repo.getById(node.id)).not.toBeNull();
    const rows = commandLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.command).toBe("FakeCommand");
    expect(rows[0]?.payload).toBe(JSON.stringify({ nodeId: node.id }));
    expect(rows[0]?.applied_at).toBe("2024-03-01T00:00:00.000Z");
  });

  it("rolls back both the apply and the log entry if apply() throws", () => {
    const node = newNodeInput({ type: "project" });
    const command = new FakeCommand(node, true);

    expect(() => executeCommand(command, ctx, commandLog)).toThrow("boom");

    expect(ctx.repo.getById(node.id)).toBeNull();
    expect(commandLogRows()).toHaveLength(0);
  });
});
