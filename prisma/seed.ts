import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../src/lib/seed";

const prisma = new PrismaClient();

seedDatabase(prisma)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
