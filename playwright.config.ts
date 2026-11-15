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
};

export default defineConfig({
  testDir: "tests/e2e",
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
