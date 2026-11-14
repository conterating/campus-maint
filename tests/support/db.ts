import { PrismaClient } from "@prisma/client";
import { seedDatabase, viewerFromSeed } from "@/lib/seed";

export const db = new PrismaClient({ datasources: { db: { url: "file:./test.db" } } });

/** Re-seed the test database. Returns the "now" the seed was built around. */
export async function reseed(now = new Date()) {
  await seedDatabase(db, { now, quiet: true });
  return now;
}

export const as = viewerFromSeed;
