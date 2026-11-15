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
    env: {
      DATABASE_URL: "file:./test.db",
      ANTHROPIC_API_KEY: "",
      BETTER_AUTH_SECRET: "test-secret-for-vitest-only-0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3000",
      SEED_DEMO_PASSWORD: "buzz-fixes-everything",
      // The breached-password check calls an external API; tests run offline.
      HIBP_DISABLED: "1",
      RESEND_API_KEY: "",
      DEMO_MODE: "true",
    },
    // Integration tests share one SQLite file.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
