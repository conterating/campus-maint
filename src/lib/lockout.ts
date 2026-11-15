import type { PrismaClient } from "@prisma/client";

// Per-username lockout: 5 failed sign-ins within 15 minutes locks the username
// for 15 minutes after the fifth failure. Applies whether or not the account
// exists, so it reveals nothing. Stored in the LoginAttempt table.

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;

export async function recordLoginAttempt(db: PrismaClient, username: string, success: boolean, reason?: string) {
  await db.loginAttempt.create({ data: { username, success, reason: reason ?? null } });
  if (success) {
    // A successful sign-in clears the slate and keeps the table small.
    await db.loginAttempt.deleteMany({ where: { username, success: false } });
  }
}

/** When the username unlocks, or null if it isn't locked. */
export async function lockedUntil(db: PrismaClient, username: string, now: Date): Promise<Date | null> {
  const recent = await db.loginAttempt.findMany({
    where: { username, success: false, createdAt: { gt: new Date(now.getTime() - WINDOW_MS - LOCK_MS) } },
    orderBy: { createdAt: "desc" },
    take: MAX_FAILURES,
  });
  if (recent.length < MAX_FAILURES) return null;
  const newest = recent[0].createdAt.getTime();
  const oldest = recent[MAX_FAILURES - 1].createdAt.getTime();
  if (newest - oldest > WINDOW_MS) return null;
  const until = newest + LOCK_MS;
  return until > now.getTime() ? new Date(until) : null;
}
