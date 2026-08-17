import type Database from "better-sqlite3";
import type { CommandLogRepository } from "./CommandLogRepository.js";

export class SqliteCommandLogRepository implements CommandLogRepository {
  constructor(private readonly db: Database.Database) {}

  append(command: string, payload: string, appliedAt: string): void {
    this.db
      .prepare(
        "INSERT INTO command_log (command, payload, applied_at) VALUES (?, ?, ?)",
      )
      .run(command, payload, appliedAt);
  }
}
