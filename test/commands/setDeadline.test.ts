import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../../commands/Command.js";
import { SetDeadline } from "../../commands/SetDeadline.js";
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

describe("SetDeadline.apply", () => {
  it("sets deadline and stamps updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      deadline: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);

    new SetDeadline(node.id, "2024-07-10").apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.deadline).toBe("2024-07-10");
    expect(row?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("accepts null to clear deadline", () => {
    const node = newNodeInput({ type: "todo", deadline: "2024-07-10" });
    repo.insert(node);

    new SetDeadline(node.id, null).apply(ctx);

    expect(repo.getById(node.id)?.deadline).toBeNull();
  });

  it("is allowed on projects and on the Inbox", () => {
    new SetDeadline(INBOX_ID, "2024-07-10").apply(ctx);
    expect(repo.getById(INBOX_ID)?.deadline).toBe("2024-07-10");
  });

  it("rejects headings, which have no dates", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);

    expect(() => new SetDeadline(heading.id, "2024-07-10").apply(ctx)).toThrow(/heading/i);
  });

  it("throws if the node does not exist", () => {
    expect(() => new SetDeadline("missing", "2024-07-10").apply(ctx)).toThrow(/not found/i);
  });
});

describe("SetDeadline.invert", () => {
  it("restores the exact prior deadline and updated_at", () => {
    const node = newNodeInput({
      type: "todo",
      deadline: "2024-05-01",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    repo.insert(node);
    const command = new SetDeadline(node.id, "2024-07-10");

    command.apply(ctx);
    command.invert().apply(ctx);

    const row = repo.getById(node.id);
    expect(row?.deadline).toBe("2024-05-01");
    expect(row?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new SetDeadline("some-id", "2024-07-10").invert()).toThrow(/apply/i);
  });
});
