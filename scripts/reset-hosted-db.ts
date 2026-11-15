// Resets the hosted (Turso) database to the demo state: drops every table,
// recreates the schema from prisma/schema.prisma, and loads the sample data.
//
// Run it once after creating the Turso database, and again after any change
// to prisma/schema.prisma. It erases everything in the hosted database, which
// is what the in-app "Reset demo data" button does to the data anyway.
//
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:hosted:reset
//
// Why a script: `prisma db push` can't talk to Turso, so the schema is turned
// into SQL with `prisma migrate diff` and applied through the libSQL client.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@libsql/client";
import { createPrismaClient } from "../src/lib/prismaClient";
import { seedDatabase } from "../src/lib/seed";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error(
      "TURSO_DATABASE_URL isn't set.\n" +
        "Copy TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from your Vercel project (Settings → Environment Variables)\n" +
        "and run: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:hosted:reset",
    );
    process.exit(1);
  }
  const root = path.resolve(import.meta.dirname, "..");
  console.log(`Resetting ${url.replace(/\?.*$/, "")}`);

  const schemaSql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const libsql = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    const existing = (await libsql.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'")).rows.map(
      (r) => String(r.name),
    );
    // One batch, so foreign_keys stays off on the same connection while tables are dropped.
    await libsql.executeMultiple(["PRAGMA foreign_keys = OFF;", ...existing.map((t) => `DROP TABLE IF EXISTS "${t.replaceAll('"', '""')}";`), "PRAGMA foreign_keys = ON;"].join("\n"));
    console.log(existing.length ? `Dropped ${existing.length} tables.` : "The database was empty.");
    await libsql.executeMultiple(schemaSql);
    console.log("Created the schema.");
  } finally {
    libsql.close();
  }

  const started = Date.now();
  const prisma = createPrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`Loaded the demo data in ${((Date.now() - started) / 1000).toFixed(1)} s. The hosted database is ready.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
