import type Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

interface Migration {
  version: number;
  sql: string;
}

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => {
      const match = /^(\d+)_/.exec(file);
      if (!match) {
        throw new Error(`Migration file ${file} is missing a numeric prefix`);
      }
      return {
        version: Number(match[1]),
        sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
      };
    });
}

export function migrate(db: Database.Database): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;

  for (const migration of loadMigrations()) {
    if (migration.version <= currentVersion) continue;
    db.exec(migration.sql);
    db.pragma(`user_version = ${migration.version}`);
  }
}
