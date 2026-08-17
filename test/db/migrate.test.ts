import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../db/migrate.js";
import { INBOX_ID } from "../../db/constants.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
});

function tableNames(): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

function indexNames(): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

describe("migrate", () => {
  it("creates the nodes and command_log tables", () => {
    migrate(db);

    expect(tableNames()).toEqual(
      expect.arrayContaining(["nodes", "command_log"]),
    );
  });

  it("creates the indexes declared in the spec", () => {
    migrate(db);

    expect(indexNames()).toEqual(
      expect.arrayContaining([
        "idx_nodes_parent",
        "idx_nodes_when",
        "idx_nodes_deadline",
        "idx_nodes_done",
        "idx_nodes_trash",
      ]),
    );
  });

  it("seeds exactly one Inbox node with is_system = 1", () => {
    migrate(db);

    const rows = db.prepare("SELECT * FROM nodes WHERE is_system = 1").all() as Array<{
      id: string;
      parent_id: string | null;
      type: string;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(INBOX_ID);
    expect(rows[0]?.parent_id).toBeNull();
    expect(rows[0]?.type).toBe("project");
  });

  it("is idempotent: running migrate twice does not duplicate the Inbox seed", () => {
    migrate(db);
    migrate(db);

    const rows = db.prepare("SELECT * FROM nodes WHERE is_system = 1").all();

    expect(rows).toHaveLength(1);
  });

  it("advances PRAGMA user_version to the latest migration", () => {
    migrate(db);

    const version = db.pragma("user_version", { simple: true });

    expect(version).toBe(3);
  });
});
