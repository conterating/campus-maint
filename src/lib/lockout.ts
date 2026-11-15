import type { PrismaClient } from "@prisma/client";

// Lockout per username + client address: 5 failed sign-ins within 15 minutes
// locks that pair for 15 minutes after the fifth failure. Keying on the pair
// means a stranger guessing a username can't lock the real owner out. Wider
// caps (per address, per username overall) live in rate-limit.ts. Applies whether or not the account
// exists, so it reveals nothing. Stored in the LoginAttempt table.

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
/** Hard cap on failures against one username from every address combined. */
export const GLOBAL_MAX_FAILURES = 30;
export const GLOBAL_WINDOW_MS = 60 * 60_000;

export async function recordLoginAttempt(db: PrismaClient, username: string, success: boolean, reason?: string, ip?: string) {
  await db.loginAttempt.create({ data: { username, success, reason: reason ?? null, ip: ip ?? null } });
  if (success) {
    // A successful sign-in clears this (username, address) pair's failures only,
    // so one lucky login can't wipe out an attacker's count from other addresses.
    await db.loginAttempt.deleteMany({ where: { username, success: false, ...(ip ? { ip } : {}) } });
  }
}

/** When the username unlocks, or null if it isn't locked. */
export async function lockedUntil(db: PrismaClient, username: string, now: Date, ip?: string): Promise<Date | null> {
  const recent = await db.loginAttempt.findMany({
    where: { username, success: false, ...(ip ? { ip } : {}), createdAt: { gt: new Date(now.getTime() - WINDOW_MS - LOCK_MS) } },
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

/** Failures against a username from any address in the window (for the slowdown, not a lock). */
export async function recentFailureCount(db: PrismaClient, username: string, now: Date): Promise<number> {
  return db.loginAttempt.count({ where: { username, success: false, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } } });
}

/** Hard per-username lock across all addresses: GLOBAL_MAX_FAILURES within GLOBAL_WINDOW_MS. */
export async function lockedUntilGlobal(db: PrismaClient, username: string, now: Date): Promise<Date | null> {
  const recent = await db.loginAttempt.findMany({
    where: { username, success: false, createdAt: { gt: new Date(now.getTime() - GLOBAL_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    take: GLOBAL_MAX_FAILURES,
  });
  if (recent.length < GLOBAL_MAX_FAILURES) return null;
  // Unlocks when the oldest counted failure leaves the window.
  const until = recent[GLOBAL_MAX_FAILURES - 1].createdAt.getTime() + GLOBAL_WINDOW_MS;
  return until > now.getTime() ? new Date(until) : null;
}
