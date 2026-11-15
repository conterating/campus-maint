import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// DB-backed sliding-window rate limits. Each event is a RateLimitHit row keyed
// by "<action>:<identifier>"; a request is allowed while fewer than `max` hits
// fall inside the window. Works across server instances because the state is
// in the database, not in memory.

export type Limit = { max: number; windowMs: number };
export type LimitResult = { ok: boolean; retryAfterMs: number };

const MIN = 60_000;
export const LIMITS = {
  /** Sign-in failures from one address, across usernames: past this, slow down (shared campus NATs must not be locked out). */
  loginIp: { max: 40, windowMs: 15 * MIN },
  /** Sign-in failures against one username from anywhere: past this, slow down instead of locking. */
  loginUserGlobal: { max: 15, windowMs: 15 * MIN },
  /** Code attempts for one user's pending two-factor sign-in (re-entering the password doesn't reset it). */
  totpUser: { max: 5, windowMs: 15 * MIN },
  totpIp: { max: 25, windowMs: 15 * MIN },
  /** Accounts created from one address. */
  signupIp: { max: 30, windowMs: 60 * MIN },
  mailUser: { max: 3, windowMs: 15 * MIN },
  /** Mail for one username from anywhere, so other addresses can't exhaust the owner's resets. */
  mailUserGlobal: { max: 10, windowMs: 60 * MIN },
  mailIp: { max: 10, windowMs: 15 * MIN },
} satisfies Record<string, Limit>;

/** IPv6 addresses count by their /64 prefix (a single host controls a whole /64); IPv4 is returned as is. */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip.includes(":")) return ip;
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return ip.slice(7);
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  if (groups.length < 4) return ip;
  return groups.slice(0, 4).map((g) => (g || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * Client address, trusting only what our own proxy layer set: x-vercel-forwarded-for,
 * then x-real-ip, then the x-forwarded-for hop TRUSTED_PROXY_HOPS from the end (default 1:
 * the last hop, appended by the nearest trusted proxy; earlier hops are client-supplied
 * and spoofable). Else "unknown".
 */
export function clientIp(h: Headers): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  const xff = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || xff[xff.length - hops] || "unknown";
  return normalizeIp(ip).slice(0, 64);
}

/** Short stable hash, so secrets (cookies) never become database keys. */
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

const keyOf = (action: string, id: string) => `${action}:${id.toLowerCase().slice(0, 128)}`;

/** Where this key stands, without recording anything. */
export async function checkLimit(db: PrismaClient, action: string, id: string, limit: Limit, now = new Date()): Promise<LimitResult> {
  const since = new Date(now.getTime() - limit.windowMs);
  const hits = await db.rateLimitHit.findMany({ where: { key: keyOf(action, id), createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, take: limit.max });
  if (hits.length < limit.max) return { ok: true, retryAfterMs: 0 };
  // Allowed again when the oldest counted hit leaves the window.
  return { ok: false, retryAfterMs: Math.max(0, hits[0].createdAt.getTime() + limit.windowMs - now.getTime()) };
}

/** Record one event. Also sweeps this key's expired rows so the table stays small. */
export async function recordHit(db: PrismaClient, action: string, id: string, limit: Limit, now = new Date()): Promise<void> {
  const key = keyOf(action, id);
  await db.rateLimitHit.create({ data: { key, createdAt: now } });
  await db.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: new Date(now.getTime() - limit.windowMs) } } });
}

/**
 * Record this request, then count including it (so concurrent requests can't all
 * slip under the cap). Over the limit means refused; the refused hit stays recorded.
 */
export async function consume(db: PrismaClient, action: string, id: string, limit: Limit, now = new Date()): Promise<LimitResult> {
  await recordHit(db, action, id, limit, now);
  const since = new Date(now.getTime() - limit.windowMs);
  const hits = await db.rateLimitHit.findMany({ where: { key: keyOf(action, id), createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });
  if (hits.length <= limit.max) return { ok: true, retryAfterMs: 0 };
  return { ok: false, retryAfterMs: Math.max(0, hits[hits.length - limit.max].createdAt.getTime() + limit.windowMs - now.getTime()) };
}

export async function clearHits(db: PrismaClient, action: string, id: string): Promise<void> {
  await db.rateLimitHit.deleteMany({ where: { key: keyOf(action, id) } });
}

export const minutesLabel = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / MIN));
  return `${m} minute${m === 1 ? "" : "s"}`;
};

/**
 * Email-sending requests (resend verification, forgot password): per address, per
 * (username, address), and a looser per-username cap. A bucket is only consumed
 * when the address check passed.
 */
export async function mailAllowed(db: PrismaClient, kind: "resend" | "forgot", username: string, ip: string, now = new Date()): Promise<boolean> {
  const byIp = await consume(db, `${kind}-ip`, ip, LIMITS.mailIp, now);
  if (!byIp.ok) return false;
  const byPair = await consume(db, `${kind}-user`, `${username}|${ip}`, LIMITS.mailUser, now);
  if (!byPair.ok) return false;
  return (await consume(db, `${kind}-user-all`, username, LIMITS.mailUserGlobal, now)).ok;
}
