// The app talks to the database only through Prisma's parameterized API.
// Raw "unsafe" queries are how SQL injection gets in, so fail if one appears.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

describe("database access", () => {
  it("never uses $queryRawUnsafe or $executeRawUnsafe", () => {
    const root = path.resolve(import.meta.dirname, "../../src");
    const offenders = sourceFiles(root).filter((f) => /\$(queryRawUnsafe|executeRawUnsafe)/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
