"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { getActor, getViewer, homeFor } from "@/lib/session";
import { afterSignIn, attemptLogin, errorCode, type FormResult, type LoginOutcome } from "@/lib/sign-in";
import { registerStudent } from "@/lib/registration";
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

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export type { LoginOutcome } from "@/lib/sign-in";

/**
 * Sign in with a username and password. The login tab only changes labels:
 * the redirect always comes from the role stored on the account.
 */
export async function loginAction(input: LoginInput): Promise<FormResult<LoginOutcome>> {
  return attemptLogin(input, await headers());
}

/** Second step for accounts with two-factor sign-in. */
export async function verifyTotpAction(input: { code: string; trustDevice?: boolean; next?: string }): Promise<FormResult<{ redirectTo: string }>> {
  const parsed = totpSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  try {
    const res = (await auth.api.verifyTOTP({ body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice }, headers: await headers() })) as { user?: { id: string } };
    if (!res?.user) throw new Error("No user");
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
    const res = (await auth.api.verifyBackupCode({ body: { code: parsed.data.code }, headers: await headers() })) as { user?: { id: string } };
    if (!res?.user) throw new Error("No user");
    return { ok: true, data: { redirectTo: await afterSignIn(res.user.id, parsed.data.next) } };
  } catch {
    return fail("That backup code didn't work.", { fieldErrors: { code: "That backup code didn't work." } });
  }
}

/** Send the verification email again. Always reports success, so it can't be used to probe accounts. */
export async function resendVerificationAction(rawUsername: string): Promise<FormResult> {
  const parsed = forgotPasswordSchema.safeParse({ username: rawUsername });
  if (parsed.success) {
    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (user && !user.emailVerified && !user.disabledAt) {
      try {
        await auth.api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/login?verified=1" } });
      } catch (err) {
        console.warn(`[auth] resend verification failed: ${errorCode(err) ?? "unknown"}`);
      }
    }
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
  redirect("/login");
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
  return registerStudent(input, await headers());
}

// ---------------------------------------------------------------------------
// Forgot / reset password, and invites
// ---------------------------------------------------------------------------

/** Always "sent", whether or not the account exists. */
export async function forgotPasswordAction(input: { username: string }): Promise<FormResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (user && !user.disabledAt) {
    try {
      await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: appUrl("/reset-password") } });
    } catch (err) {
      console.warn(`[auth] password reset request failed: ${errorCode(err) ?? "unknown"}`);
    }
  }
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(input: { token: string; password: string; confirmPassword: string }): Promise<FormResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const { token, password } = parsed.data;

  // Look up whose link this is, for the "can't contain your username" rule.
  const row = await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}` } });
  if (!row || row.expiresAt < new Date()) return fail("This reset link is invalid or has expired. Request a new one.", { code: "EXPIRED" });
  const user = await prisma.user.findUnique({ where: { id: row.value } });
  const problem = passwordProblem(password, user?.username);
  if (problem) return fail("Fix the errors below.", { fieldErrors: { password: problem } });

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password }, headers: await headers() });
    if (user) await prisma.loginAttempt.deleteMany({ where: { username: user.username ?? "", success: false } });
    return { ok: true, data: undefined };
  } catch (err) {
    const code = errorCode(err);
    if (code === "PASSWORD_COMPROMISED") return fail("Fix the errors below.", { fieldErrors: { password: "That password has appeared in a data breach. Choose a different one." } });
    return fail("This reset link is invalid or has expired. Request a new one.", { code: "EXPIRED" });
  }
}

/** Set a password from an admin invite (72-hour, single-use link). */
export async function acceptInviteAction(input: { token: string; password: string; confirmPassword: string }): Promise<FormResult<{ username: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const user = await inviteTokenUser(prisma, parsed.data.token);
  if (!user) return fail("This invite link is invalid or has expired. Ask an administrator to send a new one.", { code: "EXPIRED" });
  const problem = passwordProblem(parsed.data.password, user.username);
  if (problem) return fail("Fix the errors below.", { fieldErrors: { password: problem } });
  const res = await acceptInvite(prisma, parsed.data.token, parsed.data.password);
  if (!res.ok) return fail(res.error, { fieldErrors: res.field ? { [res.field]: res.error } : undefined });
  return { ok: true, data: { username: user.username ?? "" } };
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

