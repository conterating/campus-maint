import { describe, expect, it } from "vitest";
import {
  contractorCreateSchema,
  contractorUpdateSchema,
  fieldErrors,
  loginSchema,
  normalizePhone,
  normalizeUsername,
  passwordProblem,
  passwordStrength,
  profileSchema,
  resetPasswordSchema,
  signupSchema,
  type SignupInput,
} from "@/lib/auth-schemas";
import { canAccessPath, homeFor } from "@/lib/access";
import { impersonationTarget, impersonationValue } from "@/lib/impersonation";

const valid: SignupInput = {
  firstName: "George",
  lastName: "Burdell",
  preferredName: "",
  username: "gburdell3",
  gtId: "903123456",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
  gender: undefined,
  genderSelfDescribe: "",
  studentYear: "SECOND",
  residenceBuildingId: "b-glenn",
  roomId: "s-gln-216",
  phone: "",
  acceptTerms: true,
};

const errorsFor = (input: Partial<SignupInput>) => {
  const r = signupSchema.safeParse({ ...valid, ...input });
  return r.success ? {} : fieldErrors(r.error);
};

describe("sign-up schema", () => {
  it("accepts a complete student and normalizes it", () => {
    const r = signupSchema.parse({ ...valid, username: "  GBurdell3@gatech.edu ", gtId: "903-123-456", phone: "+1 404.555.0123" });
    expect(r).toMatchObject({ username: "gburdell3", gtId: "903123456", phone: "(404) 555-0123", residenceBuildingId: "b-glenn", roomId: "s-gln-216" });
    expect(r).not.toHaveProperty("confirmPassword");
    expect(r).not.toHaveProperty("acceptTerms");
  });

  it("validates the GT username", () => {
    expect(errorsFor({ username: "" }).username).toMatch(/GT username/);
    expect(errorsFor({ username: "3burdell" }).username).toMatch(/letter followed by/);
    expect(errorsFor({ username: "g" }).username).toBeDefined();
    expect(errorsFor({ username: "george.burdell" }).username).toBeDefined();
    expect(errorsFor({ username: "a".repeat(17) }).username).toBeDefined();
    expect(errorsFor({ username: "Gburdell3" }).username).toBeUndefined();
  });

  it("validates the GT ID: 9 digits starting with 90", () => {
    expect(errorsFor({ gtId: "" }).gtId).toBeDefined();
    expect(errorsFor({ gtId: "803123456" }).gtId).toMatch(/starts with 90/);
    expect(errorsFor({ gtId: "90312345" }).gtId).toBeDefined();
    expect(errorsFor({ gtId: "9031234567" }).gtId).toBeDefined();
    expect(errorsFor({ gtId: "90312345a" }).gtId).toBeDefined();
  });

  it("validates password length, match, and that it doesn't contain the username", () => {
    expect(errorsFor({ password: "short", confirmPassword: "short" }).password).toMatch(/12 characters/);
    expect(errorsFor({ password: "x".repeat(129), confirmPassword: "x".repeat(129) }).password).toMatch(/128/);
    expect(errorsFor({ password: "my gburdell3 password", confirmPassword: "my gburdell3 password" }).password).toMatch(/username/);
    expect(errorsFor({ password: "MY GBURDELL3 PASSWORD", confirmPassword: "MY GBURDELL3 PASSWORD" }).password).toMatch(/username/);
    expect(errorsFor({ confirmPassword: "something else entirely" }).confirmPassword).toMatch(/don't match/);
    // No forced symbol rules.
    expect(errorsFor({ password: "aaaaaaaaaaaa", confirmPassword: "aaaaaaaaaaaa" }).password).toBeUndefined();
  });

  it("requires a room unless the student lives off campus", () => {
    expect(errorsFor({ roomId: "" }).roomId).toMatch(/room number/);
    expect(errorsFor({ residenceBuildingId: "" }).residenceBuildingId).toBeDefined();
    const off = signupSchema.parse({ ...valid, residenceBuildingId: "OFF_CAMPUS", roomId: "" });
    expect(off).toMatchObject({ residenceBuildingId: null, roomId: null });
  });

  it("requires a description only for self-described gender, and drops it otherwise", () => {
    expect(errorsFor({ gender: "SELF_DESCRIBE", genderSelfDescribe: "" }).genderSelfDescribe).toBeDefined();
    expect(signupSchema.parse({ ...valid, gender: "SELF_DESCRIBE", genderSelfDescribe: "Agender" }).genderSelfDescribe).toBe("Agender");
    expect(signupSchema.parse({ ...valid, gender: "WOMAN", genderSelfDescribe: "leftover" }).genderSelfDescribe).toBeUndefined();
    expect(errorsFor({ gender: "OTHER" as never }).gender).toBeDefined();
    expect(signupSchema.parse(valid).gender).toBeUndefined();
  });

  it("requires a year, the terms, and a valid US phone", () => {
    expect(errorsFor({ studentYear: "SIXTH" as never }).studentYear).toBeDefined();
    expect(errorsFor({ acceptTerms: false as never }).acceptTerms).toMatch(/terms/);
    expect(errorsFor({ phone: "12345" }).phone).toMatch(/10-digit/);
    expect(normalizePhone("404-555-0123")).toBe("(404) 555-0123");
    expect(normalizePhone("1 (404) 555 0123")).toBe("(404) 555-0123");
    expect(normalizePhone("123-555-0123")).toBeNull();
  });

  it("ignores role and other privileged fields from input", () => {
    const r = signupSchema.parse({ ...valid, role: "ADMIN", residenceVerified: true, department: "HOUSING" } as SignupInput);
    expect(r).not.toHaveProperty("role");
    expect(r).not.toHaveProperty("residenceVerified");
    expect(r).not.toHaveProperty("department");
  });
});

describe("login, reset and profile schemas", () => {
  it("normalizes the username and strips a pasted @gatech.edu", () => {
    expect(normalizeUsername("  GBurdell3@GaTech.edu ")).toBe("gburdell3");
    expect(loginSchema.parse({ username: "GBURDELL3", password: "x" })).toMatchObject({ username: "gburdell3", rememberMe: false, tab: "student" });
  });

  it("requires matching reset passwords of the right length", () => {
    expect(resetPasswordSchema.safeParse({ token: "abcdefghijk", password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "abcdefghijk", password: "long enough pass", confirmPassword: "different pass!!" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "abcdefghijk", password: "long enough pass", confirmPassword: "long enough pass" }).success).toBe(true);
  });

  it("checks profile edits", () => {
    expect(profileSchema.safeParse({ gender: "SELF_DESCRIBE" }).success).toBe(false);
    expect(profileSchema.parse({ preferredName: "  Sam ", phone: "4045550123" })).toMatchObject({ preferredName: "Sam", phone: "(404) 555-0123" });
  });

  it("password helpers", () => {
    expect(passwordProblem("twelve chars", "")).toBeNull();
    expect(passwordProblem("has jlee42 inside", "JLEE42")).toMatch(/username/);
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("short").score).toBe(0);
    expect(passwordStrength("a much longer passphrase with words 42").score).toBeGreaterThanOrEqual(3);
  });
});

describe("contractor schemas", () => {
  const base = {
    firstName: "Ana",
    lastName: "Lopez",
    username: "alopez",
    email: "ana@lopezhvac.test",
    contractorId: "C-2001",
    companyName: "Lopez HVAC",
    trades: ["HVAC", "PLUMBING"],
    departments: ["HOUSING"],
    licenseExpiresAt: "2027-01-31",
    insuranceExpiresAt: "2027-06-30",
    backgroundCheckStatus: "CLEARED",
    residenceHallAccess: true,
    maxActiveJobs: "6",
    hourlyRate: "$55.50",
  };

  it("accepts valid Category and Department keys", () => {
    const r = contractorCreateSchema.parse(base);
    expect(r.trades).toEqual(["HVAC", "PLUMBING"]);
    expect(r.maxActiveJobs).toBe(6);
    expect(r.hourlyRate).toBe(55.5);
    expect(r.licenseExpiresAt).toBeInstanceOf(Date);
  });

  it("rejects unknown trades and departments, and empty lists", () => {
    const errs = (over: object) => {
      const r = contractorCreateSchema.safeParse({ ...base, ...over });
      return r.success ? {} : fieldErrors(r.error);
    };
    expect(errs({ trades: ["WELDING"] }).trades).toBeDefined();
    expect(errs({ trades: [] }).trades).toMatch(/at least one/);
    expect(errs({ departments: ["ATHLETICS"] }).departments).toBeDefined();
    expect(errs({ departments: [] }).departments).toBeDefined();
    expect(errs({ username: "1abc" }).username).toBeDefined();
    expect(errs({ email: "nope" }).email).toBeDefined();
    expect(errs({ contractStartsAt: "2027-02-01", contractEndsAt: "2027-01-01" }).contractEndsAt).toMatch(/can't end before/);
  });

  it("update schema takes the same profile fields", () => {
    expect(contractorUpdateSchema.safeParse({ ...base, userId: "u-x", trades: ["NOPE"] }).success).toBe(false);
    expect(contractorUpdateSchema.safeParse({ ...base, userId: "u-x" }).success).toBe(true);
  });
});

describe("redirects after sign-in", () => {
  it("sends each role home", () => {
    expect(homeFor("STUDENT")).toBe("/");
    expect(homeFor("CONTRACTOR")).toBe("/jobs");
    expect(homeFor("STAFF")).toBe("/staff");
    expect(homeFor("ADMIN")).toBe("/admin");
  });

  it("follows ?next= only for same-origin paths the role may open", () => {
    expect(canAccessPath("STUDENT", "/tickets/abc")).toBe(true);
    expect(canAccessPath("STUDENT", "/staff")).toBe(false);
    expect(canAccessPath("STUDENT", "/admin/users")).toBe(false);
    expect(canAccessPath("CONTRACTOR", "/jobs")).toBe(true);
    expect(canAccessPath("CONTRACTOR", "/map")).toBe(false);
    expect(canAccessPath("ADMIN", "/admin/audit?x=1")).toBe(true);
    expect(canAccessPath("ADMIN", "//evil.example")).toBe(false);
    expect(canAccessPath("ADMIN", "https://evil.example/admin")).toBe(false);
    expect(canAccessPath("ADMIN", "/\\evil.example")).toBe(false);
    expect(canAccessPath("STUDENT", "/login")).toBe(false);
  });
});

describe("impersonation cookie", () => {
  it("is honoured only for the admin who set it, in demo mode", () => {
    process.env.BETTER_AUTH_SECRET ??= "unit-test-secret";
    const cookie = impersonationValue("u-elena", "u-maya");
    expect(impersonationTarget({ actorId: "u-elena", actorRole: "ADMIN", demoMode: true, cookie })).toBe("u-maya");
    expect(impersonationTarget({ actorId: "u-elena", actorRole: "ADMIN", demoMode: false, cookie })).toBeNull();
    expect(impersonationTarget({ actorId: "u-linda", actorRole: "STAFF", demoMode: true, cookie })).toBeNull();
    expect(impersonationTarget({ actorId: "u-other-admin", actorRole: "ADMIN", demoMode: true, cookie })).toBeNull();
    expect(impersonationTarget({ actorId: "u-elena", actorRole: "ADMIN", demoMode: true, cookie: "u-maya.forged" })).toBeNull();
    expect(impersonationTarget({ actorId: "u-elena", actorRole: "ADMIN", demoMode: true, cookie: cookie.replace("u-maya", "u-linda") })).toBeNull();
  });
});
