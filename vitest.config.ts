import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules"],
    // Frontend test files mark their environment individually with a
    // `// @vitest-environment jsdom` docblock at the top of the file
    // (environmentMatchGlobs did not reliably match web/** here), and import
    // web/src/test/setup.ts themselves. MSW's global fetch/http patching
    // must NOT run for backend tests (it breaks supertest's real requests),
    // so this is intentionally not a global setupFiles entry.
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
  },
});
