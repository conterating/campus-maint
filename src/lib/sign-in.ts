import "server-only";
import { prisma } from "./db";
import { auth } from "./auth";
import { signInBlockReason } from "./eligibility";
import { canAccessPath, homeFor } from "./access";
import { lockedUntil, lockedUntilGlobal, recentFailureCount, recordLoginAttempt } from "./lockout";
import { LIMITS, checkLimit, clientIp, minutesLabel, recordHit } from "./rate-limit";
import { isRole } from "./domain";
import { LOGIN_ERROR, fieldErrors, loginSchema, type FieldErrors, type LoginInput } from "./auth-schemas";

// Sign-in logic shared by the login server action and the tests. Takes the
// request headers explicitly (cookies in, Set-Cookie out via nextCookies).

export type FormResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors; code?: string };

const fail = (error: string, extra: { fieldErrors?: FieldErrors; code?: string } = {}): { ok: false; error: string; fieldErrors?: FieldErrors; code?: string } => ({
  ok: false,
  error,
  ...extra,
});

/** Better Auth APIError → its machine code, without exposing details to the user. */
export function errorCode(err: unknown): string | undefined {
  return (err as { body?: { code?: string } })?.body?.code;
}

export function errorMessage(err: unknown): string | undefined {
  return (err as { body?: { message?: string } })?.body?.message;
}

export async function afterSignIn(userId: string, next: string | undefined): Promise<string> {
  const user = await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const role = isRole(user.role) ? user.role : "STUDENT";
  if (role === "ADMIN" && !user.twoFactorEnabled) return "/account/security?enroll=1";
  if (next && canAccessPath(role, next)) return next;
  return homeFor(role);
}

export type LoginOutcome = { redirectTo: string } | { twoFactor: true };

/**
 * Sign in with a username and password. The login tab only changes labels:
 * the redirect always comes from the role stored on the account.
 */
export async function attemptLogin(input: LoginInput, reqHeaders: Headers): Promise<FormResult<LoginOutcome>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const errs = fieldErrors(parsed.error);
    // Missing fields get their own messages; anything else is the generic error.
    if (errs.username === "Enter your username." || errs.password === "Enter your password.") return fail("Fix the errors below.", { fieldErrors: errs });
    return fail(LOGIN_ERROR);
  }
  const { username, password, rememberMe, next } = parsed.data;

  // Layers: this username from this address (hard lock), this username from
  // anywhere (hard lock at a much higher count), and this address overall
  // (slowdown only, so a shared campus address isn't locked out by one person).
  const ip = clientIp(reqHeaders);
  const now = new Date();
  const until = (await lockedUntil(prisma, username, now, ip)) ?? (await lockedUntilGlobal(prisma, username, now));
  if (until) {
    return fail(`Too many failed attempts. Try again in ${minutesLabel(until.getTime() - Date.now())}, or reset your password.`, { code: "LOCKED" });
  }
  const ipState = await checkLimit(prisma, "login-ip", ip, LIMITS.loginIp);
  if (!ipState.ok || (await recentFailureCount(prisma, username, now)) >= LIMITS.loginUserGlobal.max) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  const recordFailure = async (reason?: string) => {
    await recordLoginAttempt(prisma, username, false, reason, ip);
    await recordHit(prisma, "login-ip", ip, LIMITS.loginIp);
  };

  const user = await prisma.user.findUnique({ where: { username }, include: { contractorProfile: true } });
  const blocked = user ? signInBlockReason(user, new Date()) : null;
  if (blocked) {
    // Same message as a wrong password; the reason stays in the server log.
    console.warn(`[auth] sign-in refused for user ${user!.id}: ${blocked}`);
    await recordFailure(blocked);
    return fail(LOGIN_ERROR);
  }

  try {
    const res = (await auth.api.signInUsername({ body: { username, password, rememberMe }, headers: reqHeaders })) as
      | { twoFactorRedirect?: boolean; user?: { id: string } }
      | null;
    if (res && "twoFactorRedirect" in res && res.twoFactorRedirect) {
      // Password was right; the session is created after the code step.
      return { ok: true, data: { twoFactor: true } };
    }
    if (!res?.user) throw new Error("No user in sign-in response");
    await recordLoginAttempt(prisma, username, true, undefined, ip);
    return { ok: true, data: { redirectTo: await afterSignIn(res.user.id, next) } };
  } catch (err) {
    const code = errorCode(err);
    if (code === "EMAIL_NOT_VERIFIED") {
      // Only reachable with the right password, so it doesn't reveal anything new.
      return fail("Check your email to finish setting up your account.", { code: "EMAIL_NOT_VERIFIED" });
    }
    if (code !== "INVALID_USERNAME_OR_PASSWORD" && code !== "INVALID_USERNAME" && code !== "USERNAME_TOO_SHORT" && code !== "USERNAME_TOO_LONG") {
      console.warn(`[auth] sign-in failed: ${code ?? (err instanceof Error ? err.name : "unknown")}`);
    }
    await recordFailure();
    return fail(LOGIN_ERROR);
  }
}

