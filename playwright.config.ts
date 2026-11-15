import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on its own SQLite file, so
// they never touch your dev data. Tests share one database, so they run serially.
const PORT = 3200;
// The hosted Turso database and Blob store are blanked the same way: the suite
// resets its database, and must never do that to the live one.
const env = {
  DATABASE_URL: "file:./e2e.db",
  ANTHROPIC_API_KEY: "",
  GOOGLE_MAPS_API_KEY: "",
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  PORT: String(PORT),
  BETTER_AUTH_SECRET: "e2e-secret-for-playwright-only-0123456789abcdef",
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  SEED_DEMO_PASSWORD: "buzz-fixes-everything",
  DEMO_MODE: "true",
  RESEND_API_KEY: "",
  // The production build still writes mail to .mail/outbox.jsonl so tests can read the links.
  E2E_LOCAL_MAILBOX: "1",
  // The breached-password check calls an external API; tests run offline.
  HIBP_DISABLED: "1",
};
// The test process reads the same secret to compute the demo admin's TOTP codes.
Object.assign(process.env, { BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET });

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npx prisma db push --skip-generate && npx tsx prisma/seed.ts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/demo`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
