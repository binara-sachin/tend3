import Database from "better-sqlite3";
import { migrate } from "../../db/migrate.js";
import { SqliteNodeRepository } from "../../repo/SqliteNodeRepository.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";

export function createTestRepo(): {
  db: Database.Database;
  repo: NodeRepository;
} {
  const db = new Database(":memory:");
  migrate(db);
  return { db, repo: new SqliteNodeRepository(db) };
}
