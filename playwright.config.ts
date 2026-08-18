import { defineConfig } from "@playwright/test";

/**
 * A single Express + SQLite process backs the whole run, so tests run
 * serially rather than in parallel workers — avoids two unrelated tests
 * racing on the same shared database. The suite is small enough that this
 * doesn't meaningfully slow things down.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: [
    {
      // Wipes any DB left over from a previous run (including WAL/SHM
      // sidecar files) before the server opens it, so every full suite run
      // starts from an empty database.
      command: "mkdir -p .e2e-data && rm -f .e2e-data/e2e.db* && npx tsx server/index.ts",
      env: {
        TEND_DB_PATH: ".e2e-data/e2e.db",
        PORT: "3001",
      },
      port: 3001,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
