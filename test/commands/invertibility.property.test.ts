import type Database from "better-sqlite3";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Command, CommandContext } from "../../commands/Command.js";
import { CreateNode } from "../../commands/CreateNode.js";
import { executeCommand } from "../../commands/executeCommand.js";
import { HardDeleteNode } from "../../commands/HardDeleteNode.js";
import { RenameNode } from "../../commands/RenameNode.js";
import { MoveNode } from "../../commands/MoveNode.js";
import { Rebalance } from "../../commands/Rebalance.js";
import { RestoreNode } from "../../commands/RestoreNode.js";
import { SetCompleted } from "../../commands/SetCompleted.js";
import { SetDeadline } from "../../commands/SetDeadline.js";
import { SetNotes } from "../../commands/SetNotes.js";
import { SetWhen } from "../../commands/SetWhen.js";
import { TrashNode } from "../../commands/TrashNode.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { sortKeyAfter } from "../../lib/sortKey.js";
import { verifyCounts } from "../../queries/verifyCounts.js";
import { SqliteCommandLogRepository } from "../../repo/SqliteCommandLogRepository.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import type { NodeRow } from "../../repo/types.js";
import { arbitraryForest } from "../fixtures/buildTree.js";
import { seedForest } from "../fixtures/seedForest.js";
import { createTestRepo } from "../helpers/testDb.js";

export interface CommandCase {
  /** Shown in property-test failure output. */
  name: string;
  /**
   * Given a freshly seeded tree, build a command to exercise, or return
   * undefined if this particular tree has no valid target (fast-check will
   * then treat this run as a no-op rather than a failure).
   */
  build: (
    repo: NodeRepository,
    nodes: NodeRow[],
    ctx: CommandContext,
  ) => Command | undefined;
}

/**
 * Concrete commands register their case here as they're implemented
 * (Task 7 onward). Each entry gets the same apply -> invert -> compare
 * treatment against many random trees.
 *
 * EmptyTrash is deliberately never registered here: spec 7.3 lists it with
 * no inverse ("none — irreversible, confirm in UI"), and its invert()
 * throws NotInvertibleError by design (see commands/EmptyTrash.ts). It has
 * its own direct tests in test/commands/emptyTrash.test.ts instead.
 */
export const REGISTERED_COMMANDS: CommandCase[] = [
  {
    name: "CreateNode",
    build: (repo, nodes) => {
      const parent = nodes.find((n) => n.type !== "todo");
      if (!parent) return undefined;
      const siblings = repo.getChildren(parent.id);
      const sortKey = sortKeyAfter(siblings.at(-1)?.sortKey ?? null);
      return new CreateNode({
        id: generateId(),
        parentId: parent.id,
        type: "todo",
        title: "new todo",
        notes: "",
        sortKey,
        whenDate: null,
        deadline: null,
      });
    },
  },
  {
    name: "HardDeleteNode",
    build: (repo, nodes) => {
      const leaf = nodes.find((n) => repo.getChildren(n.id).length === 0);
      if (!leaf) return undefined;
      return new HardDeleteNode(leaf.id);
    },
  },
  {
    name: "RenameNode",
    build: (_repo, nodes) => {
      const target = nodes[0];
      if (!target) return undefined;
      return new RenameNode(target.id, `${target.title}-renamed`);
    },
  },
  {
    name: "SetNotes",
    build: (_repo, nodes) => {
      const target = nodes[0];
      if (!target) return undefined;
      return new SetNotes(target.id, "updated notes");
    },
  },
  {
    name: "SetWhen",
    build: (_repo, nodes) => {
      const target = nodes.find((n) => n.type !== "heading");
      if (!target) return undefined;
      return new SetWhen(target.id, "2024-07-01");
    },
  },
  {
    name: "SetDeadline",
    build: (_repo, nodes) => {
      const target = nodes.find((n) => n.type !== "heading");
      if (!target) return undefined;
      return new SetDeadline(target.id, "2024-07-10");
    },
  },
  {
    name: "SetCompleted",
    build: (_repo, nodes) => {
      const todo = nodes.find((n) => n.type === "todo");
      if (!todo) return undefined;
      return new SetCompleted(todo.id, "2024-06-15T00:00:00.000Z");
    },
  },
  {
    name: "MoveNode",
    build: (repo, nodes) => {
      for (const node of nodes) {
        for (const candidate of nodes) {
          if (candidate.id === node.id) continue;
          if (candidate.type === "todo") continue;
          if (node.type === "heading" && candidate.type !== "project") continue;
          if (repo.isDescendantOf(candidate.id, node.id)) continue;

          const siblings = repo.getChildren(candidate.id);
          const sortKey = sortKeyAfter(siblings.at(-1)?.sortKey ?? null);
          return new MoveNode(node.id, candidate.id, sortKey);
        }
      }
      return undefined;
    },
  },
  {
    name: "TrashNode",
    build: (_repo, nodes) => {
      const target = nodes[0];
      if (!target) return undefined;
      return new TrashNode(target.id, "2024-06-20T00:00:00.000Z");
    },
  },
  {
    name: "RestoreNode",
    build: (_repo, nodes, ctx) => {
      const target = nodes[0];
      if (!target) return undefined;
      // Reuses TrashNode.apply() (already proven correct) to set up the
      // precondition RestoreNode needs: a node that is currently trashed.
      new TrashNode(target.id, "2024-04-15T00:00:00.000Z").apply(ctx);
      return new RestoreNode(target.id);
    },
  },
  {
    name: "Rebalance",
    build: (repo, nodes) => {
      const parentWithChildren = nodes.find((n) => repo.getChildren(n.id).length > 0);
      if (!parentWithChildren) return undefined;
      return new Rebalance(parentWithChildren.id);
    },
  },
];

function snapshotNodes(db: Database.Database): unknown[] {
  return db.prepare("SELECT * FROM nodes ORDER BY id").all();
}

function commandLogCount(db: Database.Database): number {
  return (
    db.prepare("SELECT COUNT(*) AS count FROM command_log").get() as {
      count: number;
    }
  ).count;
}

describe("invertibility property harness", () => {
  it("snapshot comparison is reflexive for an identical tree", () => {
    const { db, repo } = createTestRepo();
    seedForest(repo, [{ type: "project", title: "P", children: [] }], "2024-04-01T00:00:00.000Z");

    expect(snapshotNodes(db)).toEqual(snapshotNodes(db));
  });

  it("snapshot comparison detects a real difference", () => {
    const { db, repo } = createTestRepo();
    const [root] = seedForest(
      repo,
      [{ type: "project", title: "P", children: [] }],
      "2024-04-01T00:00:00.000Z",
    );

    const before = snapshotNodes(db);
    repo.updateTitle(root!.id, "changed", "2024-04-02T00:00:00.000Z");
    const after = snapshotNodes(db);

    expect(after).not.toEqual(before);
  });

  it("verifyCounts is clean on a freshly seeded random forest", () => {
    fc.assert(
      fc.property(arbitraryForest(), (forest) => {
        const { repo } = createTestRepo();
        seedForest(repo, forest, "2024-04-01T00:00:00.000Z");

        expect(verifyCounts(repo)).toEqual([]);
      }),
    );
  });
});

describe("invertibility property: registered commands", () => {
  it.each(REGISTERED_COMMANDS)(
    "$name: apply then invert restores identical node state and consistent counts",
    ({ name, build }) => {
      const NUM_RUNS = 500;
      let built = 0;

      fc.assert(
        fc.property(arbitraryForest(), (forest) => {
          const { db, repo } = createTestRepo();
          const ctx: CommandContext = {
            repo,
            now: fixedClock("2024-05-01T00:00:00.000Z"),
            genId: generateId,
          };
          const commandLog = new SqliteCommandLogRepository(db);
          const nodes = seedForest(repo, forest, "2024-04-01T00:00:00.000Z");

          const command = build(repo, nodes, ctx);
          if (!command) return; // no valid target in this tree — not a failure

          built += 1;
          const before = snapshotNodes(db);

          executeCommand(command, ctx, commandLog);
          expect(verifyCounts(repo)).toEqual([]);

          const inverse = command.invert();
          executeCommand(inverse, ctx, commandLog);
          expect(verifyCounts(repo)).toEqual([]);

          expect(snapshotNodes(db)).toEqual(before);
          expect(commandLogCount(db)).toBe(2);
        }),
        { numRuns: NUM_RUNS },
      );

      // eslint-disable-next-line no-console
      console.log(`[coverage] ${name}: built ${built}/${NUM_RUNS}`);

      // A build() that skips every run would let this whole property pass
      // vacuously. Guard against the "no valid target ever found" failure
      // mode explicitly, rather than trusting the pass/fail alone.
      expect(
        built,
        `${name}: build() produced a command on only ${built}/${NUM_RUNS} runs`,
      ).toBeGreaterThan(NUM_RUNS * 0.5);
    },
  );
});
