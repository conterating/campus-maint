import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, twoFactor, username } from "better-auth/plugins";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";
import { signInBlockReason } from "./eligibility";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_PATTERN } from "./auth-schemas";

// Better Auth server configuration.
//
// Every sign-in, sign-up and password change goes through the server actions in
// src/app/(auth)/actions.ts, which validate with the shared Zod schemas and then
// call `auth.api.*`. The matching HTTP endpoints are disabled below so nobody can
// skip that validation (or the login lockout) by posting to /api/auth directly.
//
// Adding GT SSO later: add the genericOAuth plugin with a Microsoft Entra ID / GT
// CAS provider to `plugins` (see SSO_ENABLED in src/config/app.ts). Accounts link
// by email, and role/department stay `input: false`, so SSO can't grant staff access.

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Staff and administrator sessions never last longer than this. */
export const PRIVILEGED_SESSION_MAX_MS = 12 * HOUR * 1000;

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

// Breached-password checks call api.pwnedpasswords.com (k-anonymity: only the
// first five characters of the SHA-1 hash leave the server). Tests turn it off.
const hibpEnabled = process.env.HIBP_DISABLED !== "1";

export const auth = betterAuth({
  appName: "Ramblin' Repairs",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [new URL(baseURL).origin],
  database: prismaAdapter(prisma, { provider: "sqlite" }),

  // HTTP endpoints we don't expose; the server actions call auth.api directly.
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/email",
    "/sign-in/username",
    "/update-user",
    "/change-email",
    "/change-password",
    "/delete-user",
    "/request-password-reset",
    "/send-verification-email",
    "/is-username-available",
    "/reset-password",
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/two-factor/generate-backup-codes",
  ],

  user: {
    additionalFields: {
      // Set only by the server (sign-up action, admins, or the seed).
      role: { type: "string", required: false, defaultValue: "STUDENT", input: false },
      department: { type: "string", required: false, input: false },
      isSupervisor: { type: "boolean", required: false, defaultValue: false, input: false },
      residenceVerified: { type: "boolean", required: false, defaultValue: false, input: false },
      residenceVerifiedAt: { type: "date", required: false, input: false },
      residenceVerifiedById: { type: "string", required: false, input: false },
      residenceBuildingId: { type: "string", required: false, input: false },
      roomId: { type: "string", required: false, input: false },
      disabledAt: { type: "date", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
      gtId: { type: "string", required: false, input: false, returned: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
      // Profile fields. Sign-up passes them through auth.api from a validated form.
      firstName: { type: "string", required: false, defaultValue: "" },
      lastName: { type: "string", required: false, defaultValue: "" },
      preferredName: { type: "string", required: false },
      gender: { type: "string", required: false, returned: false },
      genderSelfDescribe: { type: "string", required: false, returned: false },
      studentYear: { type: "string", required: false },
      phone: { type: "string", required: false },
      avatarHue: { type: "number", required: false, defaultValue: 210, input: false },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 1 * HOUR,
    sendResetPassword: async ({ user, token }) => {
      const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
      await sendEmail({
        kind: "reset",
        to: user.email,
        subject: "Reset your Ramblin' Repairs password",
        text: `Someone asked to reset the password for your Ramblin' Repairs account.\n\nChoose a new password here (the link works once and expires in 1 hour):\n${link}\n\nIf this wasn't you, ignore this email. Your password won't change.`,
        link,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: 24 * HOUR,
    sendVerificationEmail: async ({ user, token }) => {
      const link = appUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent("/login?verified=1")}`);
      await sendEmail({
        kind: "verify",
        to: user.email,
        subject: "Finish setting up Ramblin' Repairs",
        text: `Confirm your email to finish signing up for Ramblin' Repairs (the link expires in 24 hours):\n${link}\n\nIf you didn't sign up, ignore this email.`,
        link,
      });
    },
  },

  session: {
    // "Remember me": 7 days, refreshed daily. Without it Better Auth issues a
    // browser-session cookie. Staff/admin sessions are capped at 12 hours below
    // and again in getViewer().
    expiresIn: 7 * DAY,
    updateAge: DAY,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
  },

  advanced: {
    cookiePrefix: "rr",
    useSecureCookies: baseURL.startsWith("https://") || process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { contractorProfile: true } });
          if (!user) return false;
          const blocked = signInBlockReason(user, new Date());
          if (blocked) {
            console.warn(`[auth] refused a session for user ${user.id}: ${blocked}`);
            return false;
          }
          if (user.role === "STAFF" || user.role === "ADMIN") {
            const cap = new Date(Date.now() + PRIVILEGED_SESSION_MAX_MS);
            if (new Date(session.expiresAt) > cap) return { data: { ...session, expiresAt: cap } };
          }
          return { data: session };
        },
      },
    },
  },

  plugins: [
    username({
      minUsernameLength: 2,
      maxUsernameLength: 32,
      usernameValidator: (u) => USERNAME_PATTERN.test(u) || /^[a-z][a-z0-9._-]{1,31}$/.test(u),
      validationOrder: { username: "post-normalization" },
    }),
    haveIBeenPwned({
      enabled: hibpEnabled,
      customPasswordCompromisedMessage: "That password has appeared in a data breach. Choose a different one.",
    }),
    twoFactor({
      issuer: "Ramblin' Repairs",
      backupCodeOptions: { storeBackupCodes: "encrypted" },
    }),
    // Must stay last: copies Set-Cookie from auth.api calls in server actions.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
