// Creates the Prisma client for whichever database this process should use.
//
//   Local development and tests: the SQLite file in DATABASE_URL (unchanged).
//   Hosted (Vercel): Turso, a hosted SQLite, when TURSO_DATABASE_URL is set.
//     The Turso integration in the Vercel Marketplace sets TURSO_DATABASE_URL
//     and TURSO_AUTH_TOKEN for the project automatically.
//
// Turso speaks the same SQL dialect as the local file, so the schema, the
// queries and the tests are identical in both places.
//
// No "server-only" import: the seed script and the hosted-database setup
// script run outside Next.js and use this too.
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

export function createPrismaClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return new PrismaClient();
  return new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }) });
}
