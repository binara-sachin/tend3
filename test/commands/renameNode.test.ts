import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { RenameNode } from "../../commands/RenameNode.js";
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

describe("RenameNode.apply", () => {
  it("renames a node and stamps updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      title: "old",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);

    new RenameNode(node.id, "new").apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.title).toBe("new");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("rejects renaming the Inbox", () => {
    expect(() => new RenameNode(INBOX_ID, "Not Inbox").apply(ctx)).toThrow(/inbox/i);
    expect(repo.getById(INBOX_ID)?.title).toBe("Inbox");
  });

  it("throws if the node does not exist", () => {
    expect(() => new RenameNode("missing", "x").apply(ctx)).toThrow(/not found/i);
  });
});

describe("RenameNode.invert", () => {
  it("restores the exact prior title and updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      title: "old",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);
    const command = new RenameNode(node.id, "new");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.title).toBe("old");
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new RenameNode("some-id", "x").invert()).toThrow(/apply/i);
  });
});
