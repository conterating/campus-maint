import { seedDatabase } from "../src/lib/seed";
import { createPrismaClient } from "../src/lib/prismaClient";

// Seeds the local SQLite file, or Turso when TURSO_DATABASE_URL is set.
const prisma = createPrismaClient();

seedDatabase(prisma)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
