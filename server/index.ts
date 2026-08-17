import Database from "better-sqlite3";
import { migrate } from "../db/migrate.js";
import { systemClock } from "../lib/clock.js";
import { generateId } from "../lib/id.js";
import { SqliteCommandLogRepository } from "../repo/SqliteCommandLogRepository.js";
import { SqliteNodeRepository } from "../repo/SqliteNodeRepository.js";
import { createApp } from "./app.js";

const DB_PATH = process.env.TEND_DB_PATH ?? "tend.db";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
migrate(db);

const repo = new SqliteNodeRepository(db);
const commandLog = new SqliteCommandLogRepository(db);
const ctx = { repo, now: systemClock, genId: generateId };

const app = createApp(repo, ctx, commandLog);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`tend server listening on http://localhost:${PORT}`);
});
