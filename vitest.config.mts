import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/support/global-setup.ts"],
    // Hosted-service variables are blanked so a developer's .env can never point
    // the tests at the live Turso database or Blob store.
    env: { DATABASE_URL: "file:./test.db", ANTHROPIC_API_KEY: "", TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", BLOB_READ_WRITE_TOKEN: "" },
    // Integration tests share one SQLite file.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
