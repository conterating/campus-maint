"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { getActor, getViewer, homeFor } from "@/lib/session";
import { afterSignIn, attemptLogin, errorCode, errorMessage, type FormResult, type LoginOutcome } from "@/lib/sign-in";
import { registerStudent, resendVerification } from "@/lib/registration";
import { LIMITS, checkLimit, clearHits, clientIp, consume, digest, mailAllowed, minutesLabel, recordHit } from "@/lib/rate-limit";
import { acceptInvite, inviteTokenUser } from "@/lib/accounts";
import { isRole } from "@/lib/domain";
import {
  changePasswordSchema,
  enableTwoFactorSchema,
  fieldErrors,
  forgotPasswordSchema,
  passwordProblem,
  profileSchema,
  residenceChangeSchema,
  resetPasswordSchema,
  totpSchema,
  backupCodeSchema,
  type FieldErrors,
  type LoginInput,
  type SignupInput,
} from "@/lib/auth-schemas";

export type { FormResult } from "@/lib/sign-in";

const fail = (error: string, extra: { fieldErrors?: FieldErrors; code?: string } = {}): { ok: false; error: string; fieldErrors?: FieldErrors; code?: string } => ({
  ok: false,
  error,
  ...extra,
});

/** Log the real error on the server; the caller only ever sees a generic message. */
function unexpected(where: string, err: unknown): { ok: false; error: string } {
  console.error(`[auth] ${where} failed unexpectedly: ${err instanceof Error ? err.name : "unknown"}`);
  return fail("Something went wrong on our side. Try again in a moment.");
}

/**
 * Who the pending two-factor sign-in belongs to. Better Auth's signed cookie holds a
 * verification identifier whose row stores the user id; keying on the user means
 * signing in again (new cookie) doesn't reset the count. Falls back to a hash of the cookie.
 */
async function twoFactorKeys(): Promise<{ ip: string; user: string }> {
  const h = await headers();
  const raw = h.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.split("=")[0].includes("two_factor")) ?? "";
  const value = raw ? decodeURIComponent(raw.slice(raw.indexOf("=") + 1)) : "";
  const identifier = value.includes(".") ? value.slice(0, value.lastIndexOf(".")) : value;
  const row = identifier ? await prisma.verification.findFirst({ where: { identifier }, select: { value: true } }) : null;
  return { ip: clientIp(h), user: row ? `user:${row.value}` : `cookie:${digest(raw || "none")}` };
}

/**
 * Record this code attempt, then count including it. Returns an error result when
 * the sign-in has had too many attempts; otherwise the keys, to clear on success.
 */
async function twoFactorAttempt(): Promise<{ locked: { ok: false; error: string; code: string } } | { keys: { ip: string; user: string } }> {
  const k = await twoFactorKeys();
  const [u, i] = await Promise.all([consume(prisma, "totp-user", k.user, LIMITS.totpUser), consume(prisma, "totp-ip", k.ip, LIMITS.totpIp)]);
  if (u.ok && i.ok) return { keys: k };
  return { locked: { ok: false, error: `Too many incorrect codes. Sign in again in ${minutesLabel(Math.max(u.retryAfterMs, i.retryAfterMs))}.`, code: "LOCKED" } };
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export type { LoginOutcome } from "@/lib/sign-in";

/**
 * Sign in with a username and password. The login tab only changes labels:
 * the redirect always comes from the role stored on the account.
 */
export async function loginAction(input: LoginInput): Promise<FormResult<LoginOutcome>> {
  try {
    return await attemptLogin(input, await headers());
  } catch (err) {
    return unexpected("login", err);
  }
}

/** Second step for accounts with two-factor sign-in. */
export async function verifyTotpAction(input: { code: string; trustDevice?: boolean; next?: string }): Promise<FormResult<{ redirectTo: string }>> {
  const parsed = totpSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    const attempt = await twoFactorAttempt();
    if ("locked" in attempt) return attempt.locked;
    const res = (await auth.api.verifyTOTP({ body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice }, headers: await headers() })) as { user?: { id: string } };
    if (!res?.user) throw new Error("No user");
    await clearHits(prisma, "totp-user", attempt.keys.user).catch(() => {});
    return { ok: true, data: { redirectTo: await afterSignIn(res.user.id, parsed.data.next) } };
  } catch (err) {
    const code = errorCode(err);
    if (code === "INVALID_TWO_FACTOR_COOKIE" || code === "TWO_FACTOR_EXPIRED") {
      return fail("Your sign-in timed out. Enter your username and password again.", { code: "RESTART" });
    }
    return fail("That code didn't work. Check your authenticator app and try again.", { fieldErrors: { code: "That code didn't work." } });
  }
}

export async function verifyBackupCodeAction(input: { code: string; next?: string }): Promise<FormResult<{ redirectTo: string }>> {
  const parsed = backupCodeSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    const attempt = await twoFactorAttempt();
    if ("locked" in attempt) return attempt.locked;
    const res = (await auth.api.verifyBackupCode({ body: { code: parsed.data.code }, headers: await headers() })) as { user?: { id: string } };
    if (!res?.user) throw new Error("No user");
    await clearHits(prisma, "totp-user", attempt.keys.user).catch(() => {});
    return { ok: true, data: { redirectTo: await afterSignIn(res.user.id, parsed.data.next) } };
  } catch {
    return fail("That backup code didn't work.", { fieldErrors: { code: "That backup code didn't work." } });
  }
}

/** Send the verification email again. Always reports success, so it can't be used to probe accounts. */
export async function resendVerificationAction(rawUsername: string): Promise<FormResult> {
  try {
    await resendVerification(typeof rawUsername === "string" ? rawUsername.slice(0, 200) : "", clientIp(await headers()));
  } catch (err) {
    console.warn(`[auth] resend verification action failed: ${err instanceof Error ? err.name : "unknown"}`);
  }
  return { ok: true, data: undefined };
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Already signed out.
  }
  const { cookies } = await import("next/headers");
  (await cookies()).delete("rr_view_as");
  redirect("/");
}

/** Sign out of every device, including this one. */
export async function signOutEverywhereAction(): Promise<void> {
  const actor = await getActor();
  await prisma.session.deleteMany({ where: { userId: actor.id } });
  await signOutAction();
}

// ---------------------------------------------------------------------------
// Sign up (students only)
// ---------------------------------------------------------------------------

export async function signupAction(input: SignupInput): Promise<FormResult<{ email: string }>> {
  try {
    const h = await headers();
    const ip = clientIp(h);
    // Only accounts actually created count, so typos and validation errors don't burn a shared address's quota.
    const gate = await checkLimit(prisma, "signup-ip", ip, LIMITS.signupIp);
    if (!gate.ok) return fail(`Too many sign-up attempts from this connection. Try again in ${minutesLabel(gate.retryAfterMs)}.`, { code: "RATE_LIMITED" });
    const res = await registerStudent(input, h);
    if (res.ok) await recordHit(prisma, "signup-ip", ip, LIMITS.signupIp);
    return res;
  } catch (err) {
    return unexpected("sign-up", err);
  }
}

// ---------------------------------------------------------------------------
// Forgot / reset password, and invites
// ---------------------------------------------------------------------------

/** Always "sent", whether or not the account exists. */
export async function forgotPasswordAction(input: { username: string }): Promise<FormResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    // Over the limit looks exactly like success.
    if (await mailAllowed(prisma, "forgot", parsed.data.username, clientIp(await headers()))) {
      const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
      if (user && !user.disabledAt) {
        await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: appUrl("/reset-password") } });
      }
    }
  } catch (err) {
    console.warn(`[auth] password reset request failed: ${errorCode(err) ?? "unknown"}`);
  }
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(input: { token: string; password: string; confirmPassword: string }): Promise<FormResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    return await resetPassword(parsed.data);
  } catch (err) {
    return unexpected("password reset", err);
  }
}

async function resetPassword({ token, password }: { token: string; password: string }): Promise<FormResult> {
  // Look up whose link this is, for the "can't contain your username" rule.
  const row = await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}` } });
  if (!row || row.expiresAt < new Date()) return fail("This reset link is invalid or has expired. Request a new one.", { code: "EXPIRED" });
  const user = await prisma.user.findUnique({ where: { id: row.value } });
  const problem = passwordProblem(password, user?.username);
  if (problem) return fail("Fix the errors below.", { fieldErrors: { password: problem } });

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password }, headers: await headers() });
    if (user) {
      await prisma.loginAttempt.deleteMany({ where: { username: user.username ?? "", success: false } });
      // The reset link went to this address, so using it proves the email works.
      if (!user.emailVerified) await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    }
    return { ok: true, data: undefined };
  } catch (err) {
    const code = errorCode(err);
    if (code === "PASSWORD_COMPROMISED") return fail("Fix the errors below.", { fieldErrors: { password: "That password has appeared in a data breach. Choose a different one." } });
    if (/Failed to check password/i.test(errorMessage(err) ?? "")) return fail("Fix the errors below.", { fieldErrors: { password: "We couldn't check this password against known breaches right now. Try again in a moment." } });
    return fail("This reset link is invalid or has expired. Request a new one.", { code: "EXPIRED" });
  }
}

/** Set a password from an admin invite (72-hour, single-use link). */
export async function acceptInviteAction(input: { token: string; password: string; confirmPassword: string }): Promise<FormResult<{ username: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    const user = await inviteTokenUser(prisma, parsed.data.token);
    if (!user) return fail("This invite link is invalid or has expired. Ask an administrator to send a new one.", { code: "EXPIRED" });
    const problem = passwordProblem(parsed.data.password, user.username);
    if (problem) return fail("Fix the errors below.", { fieldErrors: { password: problem } });
    const res = await acceptInvite(prisma, parsed.data.token, parsed.data.password);
    if (!res.ok) return fail(res.error, { fieldErrors: res.field ? { [res.field]: res.error } : undefined });
    return { ok: true, data: { username: user.username ?? "" } };
  } catch (err) {
    return unexpected("invite", err);
  }
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function changePasswordAction(input: { currentPassword: string; password: string; confirmPassword: string }): Promise<FormResult> {
  const actor = await getActor();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const problem = passwordProblem(parsed.data.password, actor.username);
  if (problem) return fail("Fix the errors below.", { fieldErrors: { password: problem } });
  try {
    // Signs out every other session.
    await auth.api.changePassword({
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
    return { ok: true, data: undefined };
  } catch (err) {
    const code = errorCode(err);
    if (code === "INVALID_PASSWORD") return fail("Fix the errors below.", { fieldErrors: { currentPassword: "That isn't your current password." } });
    if (code === "PASSWORD_COMPROMISED") return fail("Fix the errors below.", { fieldErrors: { password: "That password has appeared in a data breach. Choose a different one." } });
    if (/Failed to check password/i.test(errorMessage(err) ?? "")) return fail("Fix the errors below.", { fieldErrors: { password: "We couldn't check this password against known breaches right now. Try again in a moment." } });
    return fail("We couldn't change your password. Try again.");
  }
}

export async function updateProfileAction(input: { preferredName?: string; phone?: string; gender?: string; genderSelfDescribe?: string }): Promise<FormResult> {
  const actor = await getActor();
  const viewer = await getViewer();
  if (viewer.impersonator) return fail("Stop viewing as someone else before editing an account.");
  const parsed = profileSchema.safeParse({ ...input, gender: input.gender || undefined });
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const v = parsed.data;
  const isStudent = actor.role === "STUDENT";
  await prisma.user.update({
    where: { id: actor.id },
    data: {
      preferredName: v.preferredName ?? null,
      phone: v.phone ?? null,
      name: `${v.preferredName || actor.firstName || actor.name.split(" ")[0]} ${actor.lastName || actor.name.split(" ").slice(1).join(" ")}`.trim(),
      ...(isStudent ? { gender: v.gender ?? null, genderSelfDescribe: v.genderSelfDescribe ?? null } : {}),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Students: move to a different room. Housing confirms it again before it counts. */
export async function requestResidenceChangeAction(input: { residenceBuildingId: string; roomId?: string }): Promise<FormResult> {
  const actor = await getActor();
  if (actor.role !== "STUDENT") return fail("Only students have a residence on file.");
  const parsed = residenceChangeSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const v = parsed.data;
  if (v.residenceBuildingId) {
    const hall = await prisma.building.findUnique({ where: { id: v.residenceBuildingId } });
    const room = v.roomId ? await prisma.space.findUnique({ where: { id: v.roomId } }) : null;
    if (!hall || hall.kind !== "RESIDENCE") return fail("Fix the errors below.", { fieldErrors: { residenceBuildingId: "Choose a residence hall from the list." } });
    if (!room || room.buildingId !== hall.id || room.scope !== "DORM_ROOM") return fail("Fix the errors below.", { fieldErrors: { roomId: `Choose a room in ${hall.name}.` } });
  }
  await prisma.user.update({
    where: { id: actor.id },
    data: { residenceBuildingId: v.residenceBuildingId, roomId: v.roomId, residenceVerified: false, residenceVerifiedAt: null, residenceVerifiedById: null },
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Two-factor sign-in (TOTP)
// ---------------------------------------------------------------------------

export async function startTwoFactorAction(input: { password: string }): Promise<FormResult<{ totpURI: string; secret: string; backupCodes: string[] }>> {
  await getActor();
  const parsed = enableTwoFactorSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    const res = (await auth.api.enableTwoFactor({ body: { password: parsed.data.password }, headers: await headers() })) as { totpURI: string; backupCodes: string[] };
    const secret = new URL(res.totpURI).searchParams.get("secret") ?? "";
    return { ok: true, data: { totpURI: res.totpURI, secret, backupCodes: res.backupCodes } };
  } catch (err) {
    if (errorCode(err) === "INVALID_PASSWORD") return fail("Fix the errors below.", { fieldErrors: { password: "That isn't your password." } });
    return fail("We couldn't start two-factor setup. Try again.");
  }
}

export async function confirmTwoFactorAction(input: { code: string }): Promise<FormResult<{ redirectTo: string }>> {
  const actor = await getActor();
  const parsed = totpSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    await auth.api.verifyTOTP({ body: { code: parsed.data.code }, headers: await headers() });
    revalidatePath("/", "layout");
    return { ok: true, data: { redirectTo: homeFor(isRole(actor.role) ? actor.role : "STUDENT") } };
  } catch {
    return fail("That code didn't work. Check the time on your phone and try again.", { fieldErrors: { code: "That code didn't work." } });
  }
}

export async function disableTwoFactorAction(input: { password: string }): Promise<FormResult> {
  const actor = await getActor();
  if (actor.role === "ADMIN") return fail("Administrators must keep two-factor sign-in on.");
  const parsed = enableTwoFactorSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    await auth.api.disableTwoFactor({ body: { password: parsed.data.password }, headers: await headers() });
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    if (errorCode(err) === "INVALID_PASSWORD") return fail("Fix the errors below.", { fieldErrors: { password: "That isn't your password." } });
    return fail("Sign in again, then turn off two-factor sign-in.");
  }
}

