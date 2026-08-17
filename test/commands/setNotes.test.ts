import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { SetNotes } from "../../commands/SetNotes.js";
import { INBOX_ID } from "../../db/constants.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { verifyCounts } from "../../queries/verifyCounts.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;
let ctx: CommandContext;

beforeEach(() => {
  ({ repo } = createTestRepo());
  ctx = { repo, now: fixedClock("2024-06-01T00:00:00.000Z"), genId: generateId };
});

afterEach(() => {
  expect(verifyCounts(repo)).toEqual([]);
});

describe("SetNotes.apply", () => {
  it("sets notes and stamps updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      notes: "old",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);

    new SetNotes(node.id, "new notes").apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.notes).toBe("new notes");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("is allowed on the Inbox (only structural ops are blocked)", () => {
    new SetNotes(INBOX_ID, "capture everything").apply(ctx);

    expect(repo.getById(INBOX_ID)?.notes).toBe("capture everything");
  });

  it("throws if the node does not exist", () => {
    expect(() => new SetNotes("missing", "x").apply(ctx)).toThrow(/not found/i);
  });
});

describe("SetNotes.invert", () => {
  it("restores the exact prior notes and updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      notes: "old",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);
    const command = new SetNotes(node.id, "new notes");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.notes).toBe("old");
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new SetNotes("some-id", "x").invert()).toThrow(/apply/i);
  });
});
