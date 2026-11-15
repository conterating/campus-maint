import { createHmac, timingSafeEqual } from "node:crypto";

// Demo-mode "view as". The cookie is signed and bound to the admin who set it,
// and is honoured only when DEMO_MODE=true and the signed-in user is an ADMIN.

function sign(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`rr-impersonate:${value}`).digest("base64url");
}

/** Cookie value binding the admin to the user they're viewing as. */
export function impersonationValue(adminId: string, targetId: string): string {
  return `${targetId}.${sign(`${adminId}:${targetId}`)}`;
}

/** The user id to view as, or null when the cookie must be ignored. */
export function impersonationTarget(opts: { actorId: string; actorRole: string; demoMode: boolean; cookie: string | undefined }): string | null {
  const { actorId, actorRole, demoMode, cookie } = opts;
  if (!demoMode || actorRole !== "ADMIN" || !cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const targetId = cookie.slice(0, dot);
  if (targetId === actorId) return null;
  const given = Buffer.from(cookie.slice(dot + 1));
  const expected = Buffer.from(sign(`${actorId}:${targetId}`));
  return given.length === expected.length && timingSafeEqual(given, expected) ? targetId : null;
}
