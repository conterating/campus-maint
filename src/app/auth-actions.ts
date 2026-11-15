"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { getActor, getViewer, homeFor } from "@/lib/session";
import { signInBlockReason } from "@/lib/eligibility";
import { canAccessPath } from "@/lib/access";
import { recordLoginAttempt, lockedUntil } from "@/lib/lockout";
import { acceptInvite, inviteTokenUser } from "@/lib/accounts";
import { isRole } from "@/lib/domain";
import {
  LOGIN_ERROR,
  changePasswordSchema,
  emailForUsername,
  enableTwoFactorSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  passwordProblem,
  profileSchema,
  residenceChangeSchema,
  resetPasswordSchema,
  signupSchema,
  totpSchema,
  backupCodeSchema,
  type FieldErrors,
  type LoginInput,
  type SignupInput,
} from "@/lib/auth-schemas";

export type FormResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors; code?: string };

const fail = (error: string, extra: { fieldErrors?: FieldErrors; code?: string } = {}): { ok: false; error: string; fieldErrors?: FieldErrors; code?: string } => ({
  ok: false,
  error,
  ...extra,
});

/** Better Auth APIError → its machine code, without exposing details to the user. */
function errorCode(err: unknown): string | undefined {
  const e = err as { body?: { code?: string }; status?: string | number };
  return e?.body?.code;
}

function errorMessage(err: unknown): string | undefined {
  return (err as { body?: { message?: string } })?.body?.message;
}

async function afterSignIn(userId: string, next: string | undefined): Promise<string> {
  const user = await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const role = isRole(user.role) ? user.role : "STUDENT";
  if (role === "ADMIN" && !user.twoFactorEnabled) return "/account/security?enroll=1";
  if (next && canAccessPath(role, next)) return next;
  return homeFor(role);
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export type LoginOutcome = { redirectTo: string } | { twoFactor: true };

/**
 * Sign in with a username and password. The login tab only changes labels:
 * the redirect always comes from the role stored on the account.
 */
export async function loginAction(input: LoginInput): Promise<FormResult<LoginOutcome>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const errs = fieldErrors(parsed.error);
    // Missing fields get their own messages; anything else is the generic error.
    if (errs.username === "Enter your username." || errs.password === "Enter your password.") return fail("Fix the errors below.", { fieldErrors: errs });
    return fail(LOGIN_ERROR);
  }
  const { username, password, rememberMe, next } = parsed.data;

  const until = await lockedUntil(prisma, username, new Date());
  if (until) {
    const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return fail(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`, { code: "LOCKED" });
  }

  const user = await prisma.user.findUnique({ where: { username }, include: { contractorProfile: true } });
  const blocked = user ? signInBlockReason(user, new Date()) : null;
  if (blocked) {
    // Same message as a wrong password; the reason stays in the server log.
    console.warn(`[auth] sign-in refused for user ${user!.id}: ${blocked}`);
    await recordLoginAttempt(prisma, username, false, blocked);
    return fail(LOGIN_ERROR);
  }

  try {
    const res = (await auth.api.signInUsername({ body: { username, password, rememberMe }, headers: await headers() })) as
      | { twoFactorRedirect?: boolean; user?: { id: string } }
      | null;
    if (res && "twoFactorRedirect" in res && res.twoFactorRedirect) {
      // Password was right; the session is created after the code step.
      return { ok: true, data: { twoFactor: true } };
    }
    if (!res?.user) throw new Error("No user in sign-in response");
    await recordLoginAttempt(prisma, username, true);
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
    await recordLoginAttempt(prisma, username, false);
    return fail(LOGIN_ERROR);
  }
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
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const v = parsed.data;

  // Duplicates: same message shape either way, with links to sign in or reset.
  const [byUsername, byGtId] = await Promise.all([
    prisma.user.findUnique({ where: { username: v.username }, select: { id: true } }),
    prisma.user.findUnique({ where: { gtId: v.gtId }, select: { id: true } }),
  ]);
  if (byUsername || byGtId) {
    const which = byUsername ? "username" : "GT ID";
    return fail(`An account already exists for this ${which}.`, {
      code: "DUPLICATE",
      fieldErrors: byUsername ? { username: "An account already exists for this username." } : { gtId: "An account already exists for this GT ID." },
    });
  }

  // The room must be a real DORM_ROOM in the chosen residence hall.
  if (v.residenceBuildingId) {
    const hall = await prisma.building.findUnique({ where: { id: v.residenceBuildingId } });
    if (!hall || hall.kind !== "RESIDENCE") return fail("Fix the errors below.", { fieldErrors: { residenceBuildingId: "Choose a residence hall from the list." } });
    const room = v.roomId ? await prisma.space.findUnique({ where: { id: v.roomId } }) : null;
    if (!room || room.buildingId !== hall.id || room.scope !== "DORM_ROOM") {
      return fail("Fix the errors below.", { fieldErrors: { roomId: `Choose a room in ${hall.name}.` } });
    }
  }

  const email = emailForUsername(v.username);
  const name = `${v.preferredName || v.firstName} ${v.lastName}`;
  try {
    const res = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password: v.password,
        username: v.username,
        displayUsername: v.username,
        firstName: v.firstName,
        lastName: v.lastName,
        preferredName: v.preferredName,
        gender: v.gender,
        genderSelfDescribe: v.genderSelfDescribe,
        studentYear: v.studentYear,
        phone: v.phone,
        callbackURL: "/login?verified=1",
      },
      headers: await headers(),
    });
    // Fields that can't come from client input are written by the server.
    await prisma.user.update({
      where: { id: res.user.id },
      data: {
        role: "STUDENT",
        gtId: v.gtId,
        residenceBuildingId: v.residenceBuildingId,
        roomId: v.roomId,
        residenceVerified: false,
        termsAcceptedAt: new Date(),
        avatarHue: Math.floor(Math.random() * 360),
      },
    });
    return { ok: true, data: { email } };
  } catch (err) {
    const code = errorCode(err);
    if (code === "PASSWORD_COMPROMISED") {
      return fail("Fix the errors below.", { fieldErrors: { password: "That password has appeared in a data breach. Choose a different one." } });
    }
    if (code === "USERNAME_IS_ALREADY_TAKEN" || code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return fail("An account already exists for this username.", { code: "DUPLICATE", fieldErrors: { username: "An account already exists for this username." } });
    }
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return fail("Fix the errors below.", { fieldErrors: { password: errorMessage(err) ?? "Choose a different password." } });
    console.error(`[auth] sign-up failed: ${code ?? (err instanceof Error ? err.message : "unknown")}`);
    return fail("We couldn't create your account. Try again in a moment.");
  }
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

