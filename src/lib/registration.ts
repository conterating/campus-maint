import "server-only";
import { prisma } from "./db";
import { auth } from "./auth";
import { findOrCreateRoom } from "./rooms";
import { errorCode, errorMessage, findUserByIdentifier, type FormResult } from "./sign-in";
import { mailAllowed } from "./rate-limit";
import { fieldErrors, usernameBaseFromEmail, forgotPasswordSchema, signupSchema, type FieldErrors, type SignupInput } from "./auth-schemas";

// Student self sign-up, shared by the server action and the tests.

const fail = (error: string, extra: { fieldErrors?: FieldErrors; code?: string } = {}): { ok: false; error: string; fieldErrors?: FieldErrors; code?: string } => ({
  ok: false,
  error,
  ...extra,
});

export async function registerStudent(input: SignupInput, reqHeaders: Headers): Promise<FormResult<{ email: string }>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return fail("Fix the errors below.", { fieldErrors: fieldErrors(parsed.error) });
  const v = parsed.data;

  // Duplicates: same message shape either way, with links to sign in or reset.
  const [byEmail, byGtId] = await Promise.all([
    prisma.user.findFirst({ where: { email: v.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { gtId: v.gtId }, select: { id: true } }),
  ]);
  if (byEmail || byGtId) {
    const which = byEmail ? "email" : "GT ID";
    return fail(`An account already exists for this ${which}.`, {
      code: "DUPLICATE",
      fieldErrors: byEmail ? { email: "An account already exists for this email." } : { gtId: "An account already exists for this GT ID." },
    });
  }

  // The hall must be a residence hall; the typed room number becomes a DORM_ROOM in it.
  let hall: Awaited<ReturnType<typeof prisma.building.findUnique>> = null;
  if (v.residenceBuildingId) {
    hall = await prisma.building.findUnique({ where: { id: v.residenceBuildingId } });
    if (!hall || hall.kind !== "RESIDENCE") return fail("Fix the errors below.", { fieldErrors: { residenceBuildingId: "Choose a residence hall from the list." } });
    if (!v.roomNumber) return fail("Fix the errors below.", { fieldErrors: { roomNumber: "Enter your room number, or pick Off campus." } });
  }

  const email = v.email;
  // Internal sign-in name, from the email's first part; users never see or type it.
  const base = usernameBaseFromEmail(email);
  let username = base;
  for (let n = 2; await prisma.user.findUnique({ where: { username }, select: { id: true } }); n++) {
    username = `${base.slice(0, 20)}${n}`;
  }
  const name = `${v.preferredName || v.firstName} ${v.lastName}`;
  try {
    const res = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password: v.password,
        username,
        displayUsername: username,
        firstName: v.firstName,
        lastName: v.lastName,
        preferredName: v.preferredName,
        gender: v.gender,
        genderSelfDescribe: v.genderSelfDescribe,
        studentYear: v.studentYear,
        phone: v.phone,
        callbackURL: "/login?verified=1",
      },
      headers: reqHeaders,
    });
    // Fields that can't come from client input are written by the server.
    const room = hall && v.roomNumber ? await findOrCreateRoom(prisma, hall, v.roomNumber) : null;
    await prisma.user.update({
      where: { id: res.user.id },
      data: {
        role: "STUDENT",
        gtId: v.gtId,
        residenceBuildingId: v.residenceBuildingId,
        roomId: room?.id ?? null,
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
    if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return fail("An account already exists for this email.", { code: "DUPLICATE", fieldErrors: { email: "An account already exists for this email." } });
    }
    if (code === "USERNAME_IS_ALREADY_TAKEN") {
      // Lost a race for the generated username: ask them to try again.
      return fail("We couldn't create your account. Try again in a moment.");
    }
    if (/Failed to check password/i.test(errorMessage(err) ?? "")) {
      return fail("Fix the errors below.", { fieldErrors: { password: "We couldn't check this password against known breaches right now. Try again in a moment." } });
    }
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return fail("Fix the errors below.", { fieldErrors: { password: errorMessage(err) ?? "Choose a different password." } });
    console.error(`[auth] sign-up failed: ${code ?? (err instanceof Error ? err.message : "unknown")}`);
    return fail("We couldn't create your account. Try again in a moment.");
  }
}


/**
 * Send the verification email again. Always resolves the same way, whether or
 * not the account exists, is already verified, or the caller is rate limited,
 * so it can't be used to probe accounts or to flood an inbox.
 */
export async function resendVerification(rawIdentifier: string, ip: string): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse({ username: rawIdentifier });
  if (!parsed.success) return;
  try {
    // Rate limit on the account when there is one, so email and username share a budget.
    const user = await findUserByIdentifier(parsed.data.username);
    if (!(await mailAllowed(prisma, "resend", user?.username ?? parsed.data.username, ip))) return;
    if (user && !user.emailVerified && !user.disabledAt) {
      await auth.api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/login?verified=1" } });
    }
  } catch (err) {
    console.warn(`[auth] resend verification failed: ${errorCode(err) ?? "unknown"}`);
  }
}
