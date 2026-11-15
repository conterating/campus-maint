// One Zod schema per account form, shared by the browser and the server actions.
// Pure module: no server imports.
import * as z from "zod";
import {
  AVAILABILITIES,
  BACKGROUND_CHECK_STATUSES,
  CATEGORIES,
  DEPARTMENTS,
  GENDERS,
  SKILLS,
  STUDENT_YEARS,
} from "./domain";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const PASSWORD_HINT = "Create a password for Ramblin' Repairs. Don't reuse your Georgia Tech password.";
export const LOGIN_ERROR = "Username or password is incorrect.";

/** GT usernames: a letter, then letters/digits, 2–16 characters total (e.g. "gburdell3"). */
export const USERNAME_PATTERN = /^[a-z][a-z0-9]{1,15}$/;
/** Contractor usernames may also use . _ - (they have no GT account). */
export const CONTRACTOR_USERNAME_PATTERN = /^[a-z][a-z0-9._-]{1,31}$/;
export const GT_ID_PATTERN = /^90\d{7}$/;
export const OFF_CAMPUS = "OFF_CAMPUS";

/** "Room 214", "apt #504b", " 3-112 " → "214", "504B", "3-112". Empty if it isn't a plausible room number. */
export function normalizeRoomNumber(raw: string): string {
  const v = raw
    .trim()
    .replace(/^(room|rm\.?|apartment|apt\.?|suite|ste\.?|unit)\s*/i, "")
    .replace(/^#\s*/, "")
    .toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{0,7}$/.test(v) ? v : "";
}

/** Lowercase, trim, and drop a pasted "@gatech.edu". */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/@gatech\.edu$/, "");
}

export function emailForUsername(username: string): string {
  return `${username}@gatech.edu`;
}

/** US phone numbers: 10 digits, optional +1, any common punctuation. Stored as (404) 555-0123. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const trimmed = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const usernameField = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(1, "Enter your GT username.")
      .regex(USERNAME_PATTERN, "Use your GT username: a letter followed by letters or numbers (2–16 characters), like gburdell3."),
  );

export const gtIdField = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().min(1, "Enter your GT ID.").regex(GT_ID_PATTERN, "Your GT ID is 9 digits and starts with 90."));

export const phoneField = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit US phone number, like 404-555-0123." });
      return z.NEVER;
    }
    return p;
  });

/** Length and "doesn't contain the username" rules. Breach checks happen on the server. */
export function passwordProblem(password: string, username?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  const u = username ? normalizeUsername(username) : "";
  if (u.length >= 2 && password.toLowerCase().includes(u)) return "Your password can't contain your username.";
  return null;
}

/** Rough strength for the meter only (0–4). Never blocks a submission on its own. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "Too short" };
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 16) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 2) score++;
  if (password.length >= 20 || (classes >= 3 && password.length >= 14)) score++;
  if (/^(.)\1+$/.test(password) || /^(?:0123|1234|abcd|qwer|pass)/i.test(password)) score = Math.min(score, 1);
  if (password.length < PASSWORD_MIN) score = 0;
  const s = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong"][s] };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const LOGIN_TABS = ["student", "contractor", "staff"] as const;
export type LoginTab = (typeof LOGIN_TABS)[number];

export const loginSchema = z.object({
  // Lenient on purpose: any malformed username just fails with the generic message.
  username: z.string().transform(normalizeUsername).pipe(z.string().min(1, "Enter your username.").max(64, LOGIN_ERROR)),
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX, LOGIN_ERROR),
  rememberMe: z.boolean().default(false),
  tab: z.enum(LOGIN_TABS).default("student"),
  next: z.string().optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

export const totpSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.")),
  trustDevice: z.boolean().default(false),
  next: z.string().optional(),
});

export const backupCodeSchema = z.object({
  code: z.string().trim().min(6, "Enter one of your backup codes.").max(32, "Enter one of your backup codes."),
  next: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Sign-up (students only)
// ---------------------------------------------------------------------------

export const signupSchema = z
  .object({
    firstName: trimmed(60).min(1, "Enter your first name."),
    lastName: trimmed(60).min(1, "Enter your last name."),
    preferredName: optionalText(60),
    username: usernameField,
    gtId: gtIdField,
    password: z.string(),
    confirmPassword: z.string(),
    gender: z.enum(GENDERS, "Choose an option from the list.").optional(),
    genderSelfDescribe: optionalText(60),
    studentYear: z.enum(STUDENT_YEARS, "Choose your year."),
    residenceBuildingId: z.string().min(1, "Choose your residence hall, or Off campus."),
    roomNumber: optionalText(20),
    phone: phoneField,
    acceptTerms: z.literal(true, "You need to agree to the terms and privacy notice."),
  })
  .superRefine((v, ctx) => {
    const pw = passwordProblem(v.password, v.username);
    if (pw) ctx.addIssue({ code: "custom", path: ["password"], message: pw });
    if (v.confirmPassword !== v.password) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords don't match." });
    if (v.residenceBuildingId !== OFF_CAMPUS) {
      if (!v.roomNumber) ctx.addIssue({ code: "custom", path: ["roomNumber"], message: "Enter your room number, or pick Off campus." });
      else if (!normalizeRoomNumber(v.roomNumber)) ctx.addIssue({ code: "custom", path: ["roomNumber"], message: "Enter just the room or apartment number, like 214 or 504B." });
    }
    if (v.gender === "SELF_DESCRIBE" && !v.genderSelfDescribe) {
      ctx.addIssue({ code: "custom", path: ["genderSelfDescribe"], message: "Describe your gender, or choose another option." });
    }
  })
  .transform((all) => {
    const v = { ...all } as Partial<typeof all>;
    delete v.confirmPassword;
    delete v.acceptTerms;
    return v as Omit<typeof all, "confirmPassword" | "acceptTerms">;
  })
  .transform((v) => ({
    ...v,
    genderSelfDescribe: v.gender === "SELF_DESCRIBE" ? v.genderSelfDescribe : undefined,
    residenceBuildingId: v.residenceBuildingId === OFF_CAMPUS ? null : v.residenceBuildingId,
    roomNumber: v.residenceBuildingId === OFF_CAMPUS ? null : normalizeRoomNumber(v.roomNumber ?? "") || null,
  }));
export type SignupInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  username: z.string().transform(normalizeUsername).pipe(z.string().min(1, "Enter your username.").max(64, "Enter your username.")),
});

/** Reset and invite links. `username` is looked up on the server for the contains-username rule. */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "This link is invalid or has expired."),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    const pw = passwordProblem(v.password);
    if (pw) ctx.addIssue({ code: "custom", path: ["password"], message: pw });
    if (v.confirmPassword !== v.password) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords don't match." });
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    const pw = passwordProblem(v.password);
    if (pw) ctx.addIssue({ code: "custom", path: ["password"], message: pw });
    if (v.confirmPassword !== v.password) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords don't match." });
    if (v.password && v.password === v.currentPassword) ctx.addIssue({ code: "custom", path: ["password"], message: "Choose a password you aren't using now." });
  });

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const profileSchema = z
  .object({
    preferredName: optionalText(60),
    phone: phoneField,
    gender: z.enum(GENDERS, "Choose an option from the list.").optional(),
    genderSelfDescribe: optionalText(60),
  })
  .superRefine((v, ctx) => {
    if (v.gender === "SELF_DESCRIBE" && !v.genderSelfDescribe) {
      ctx.addIssue({ code: "custom", path: ["genderSelfDescribe"], message: "Describe your gender, or choose another option." });
    }
  })
  .transform((v) => ({ ...v, genderSelfDescribe: v.gender === "SELF_DESCRIBE" ? v.genderSelfDescribe : undefined }));

export const residenceChangeSchema = z
  .object({
    residenceBuildingId: z.string().min(1, "Choose your residence hall, or Off campus."),
    roomId: optionalText(64),
  })
  .superRefine((v, ctx) => {
    if (v.residenceBuildingId !== OFF_CAMPUS && !v.roomId) ctx.addIssue({ code: "custom", path: ["roomId"], message: "Choose your room number, or pick Off campus." });
  })
  .transform((v) => ({
    residenceBuildingId: v.residenceBuildingId === OFF_CAMPUS ? null : v.residenceBuildingId,
    roomId: v.residenceBuildingId === OFF_CAMPUS ? null : (v.roomId ?? null),
  }));

export const enableTwoFactorSchema = z.object({ password: z.string().min(1, "Enter your password to continue.") });

// ---------------------------------------------------------------------------
// Admin: staff accounts
// ---------------------------------------------------------------------------

const permissionFlags = {
  canManageUsers: z.boolean().default(false),
  canManageContractors: z.boolean().default(false),
  canVerifyResidence: z.boolean().default(false),
  canViewAnalytics: z.boolean().default(false),
  canAssignWork: z.boolean().default(true),
};

export const staffAccountSchema = z
  .object({
    role: z.enum(["STAFF", "ADMIN"], "Choose Staff or Administrator."),
    firstName: trimmed(60).min(1, "Enter a first name."),
    lastName: trimmed(60).min(1, "Enter a last name."),
    preferredName: optionalText(60),
    username: usernameField,
    gtId: gtIdField,
    department: z.enum(DEPARTMENTS, "Choose a department.").optional(),
    isSupervisor: z.boolean().default(false),
    employeeId: trimmed(32).min(1, "Enter the employee ID."),
    title: trimmed(80).min(1, "Enter a job title."),
    officePhone: phoneField,
    officeLocation: optionalText(80),
    phone: phoneField,
    ...permissionFlags,
  })
  .superRefine((v, ctx) => {
    if (v.role === "STAFF" && !v.department) ctx.addIssue({ code: "custom", path: ["department"], message: "Staff need a department." });
  });

export const staffUpdateSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(["STUDENT", "CONTRACTOR", "STAFF", "ADMIN"], "Choose a role."),
    department: z.enum(DEPARTMENTS).optional(),
    isSupervisor: z.boolean().default(false),
    title: optionalText(80),
    ...permissionFlags,
  })
  .superRefine((v, ctx) => {
    if (v.role === "STAFF" && !v.department) ctx.addIssue({ code: "custom", path: ["department"], message: "Staff need a department." });
  });

// ---------------------------------------------------------------------------
// Admin: contractors
// ---------------------------------------------------------------------------

const dateField = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(`${v}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return d;
  });

const money = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 100_000) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in dollars, like 42.50." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const contractorProfileFields = {
  companyName: trimmed(100).min(1, "Enter the company name."),
  companyPhone: phoneField,
  trades: z.array(z.enum(CATEGORIES, "Choose trades from the list.")).min(1, "Choose at least one trade."),
  departments: z.array(z.enum(DEPARTMENTS, "Choose departments from the list.")).min(1, "Choose at least one department."),
  licenseNumber: optionalText(40),
  licenseExpiresAt: dateField,
  insuranceExpiresAt: dateField,
  backgroundCheckStatus: z.enum(BACKGROUND_CHECK_STATUSES, "Choose a background check status."),
  backgroundCheckedAt: dateField,
  residenceHallAccess: z.boolean().default(false),
  maxActiveJobs: z.coerce.number().int("Use a whole number.").min(1, "At least 1.").max(50, "At most 50."),
  hourlyRate: money,
  // Scheduling. Optional so callers that don't know about them leave them alone.
  skills: z.array(z.enum(SKILLS, "Choose skills from the list.")).optional(),
  shiftStartMinute: z.coerce.number().int().min(0).max(1439).optional(),
  shiftEndMinute: z.coerce.number().int().min(1).max(1440).optional(),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
  onCall: z.boolean().optional(),
  contractStartsAt: dateField,
  contractEndsAt: dateField,
};

export const contractorCreateSchema = z
  .object({
    firstName: trimmed(60).min(1, "Enter a first name."),
    lastName: trimmed(60).min(1, "Enter a last name."),
    username: z
      .string()
      .transform(normalizeUsername)
      .pipe(z.string().regex(CONTRACTOR_USERNAME_PATTERN, "Start with a letter; use letters, numbers, . _ or - (2–32 characters).")),
    email: z.string().trim().toLowerCase().email("Enter the contractor's email address."),
    phone: phoneField,
    contractorId: trimmed(32).min(1, "Enter the badge or vendor number."),
    ...contractorProfileFields,
  })
  .superRefine(contractDatesInOrder);

export const contractorUpdateSchema = z
  .object({ userId: z.string().min(1), ...contractorProfileFields })
  .superRefine(contractDatesInOrder);

function contractDatesInOrder(v: { contractStartsAt: Date | null; contractEndsAt: Date | null; shiftStartMinute?: number; shiftEndMinute?: number }, ctx: z.RefinementCtx) {
  if (v.shiftStartMinute !== undefined && v.shiftEndMinute !== undefined && v.shiftEndMinute <= v.shiftStartMinute) {
    ctx.addIssue({ code: "custom", path: ["shiftEndMinute"], message: "The shift has to end after it starts." });
  }
  if (v.contractStartsAt && v.contractEndsAt && v.contractEndsAt < v.contractStartsAt) {
    ctx.addIssue({ code: "custom", path: ["contractEndsAt"], message: "The contract can't end before it starts." });
  }
}

export const availabilitySchema = z.enum(AVAILABILITIES, "Choose your availability.");

// ---------------------------------------------------------------------------
// Contractor work log
// ---------------------------------------------------------------------------

export const finishWorkSchema = z.object({
  ticketId: z.string().min(1),
  materials: optionalText(500),
  materialsCost: money,
  notes: optionalText(1000),
  completionPhotoUrl: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Helpers for forms
// ---------------------------------------------------------------------------

export type FieldErrors = Record<string, string>;

/** First message per field, keyed by the top-level field name. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
