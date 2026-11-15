import { describe, expect, it } from "vitest";
import { assignmentProblems, credentialWarnings, signInBlockReason, type ContractorForAssignment } from "@/lib/eligibility";

const now = new Date("2026-11-14T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

const good: ContractorForAssignment = {
  userId: "c1",
  role: "CONTRACTOR",
  disabledAt: null,
  trades: "PLUMBING,HVAC",
  departments: "HOUSING,FACILITIES",
  licenseExpiresAt: days(200),
  insuranceExpiresAt: days(100),
  backgroundCheckStatus: "CLEARED",
  residenceHallAccess: true,
  availability: "AVAILABLE",
  maxActiveJobs: 3,
  contractEndsAt: days(300),
};
const roomLeak = { department: "HOUSING", category: "PLUMBING", scope: "ROOM" };

describe("contractor eligibility for assignment", () => {
  it("accepts a contractor with the right department, trade, credentials and access", () => {
    expect(assignmentProblems(good, roomLeak, 0, now)).toEqual([]);
    expect(assignmentProblems({ ...good, availability: "ON_JOB" }, roomLeak, 2, now)).toEqual([]);
  });

  it("checks department and trade", () => {
    expect(assignmentProblems(good, { ...roomLeak, department: "IT" }, 0, now)).toEqual(["Doesn't work for this department"]);
    expect(assignmentProblems(good, { ...roomLeak, category: "ELECTRICAL" }, 0, now)).toEqual(["No trade covering this category"]);
  });

  it("checks license and insurance expiry", () => {
    expect(assignmentProblems({ ...good, licenseExpiresAt: days(-1) }, roomLeak, 0, now)).toEqual(["License expired or missing"]);
    expect(assignmentProblems({ ...good, licenseExpiresAt: null }, roomLeak, 0, now)).toEqual(["License expired or missing"]);
    expect(assignmentProblems({ ...good, insuranceExpiresAt: days(-3) }, roomLeak, 0, now)).toEqual(["Insurance expired or missing"]);
  });

  it("requires residence hall access for ROOM and DORM tickets only", () => {
    const noAccess = { ...good, residenceHallAccess: false };
    expect(assignmentProblems(noAccess, roomLeak, 0, now)).toEqual(["Not cleared to work inside residence halls"]);
    expect(assignmentProblems(noAccess, { ...roomLeak, scope: "DORM" }, 0, now)).toHaveLength(1);
    expect(assignmentProblems(noAccess, { ...roomLeak, scope: "PUBLIC" }, 0, now)).toEqual([]);
  });

  it("checks availability and the active job limit", () => {
    expect(assignmentProblems({ ...good, availability: "OFF_DUTY" }, roomLeak, 0, now)).toEqual(["Off duty"]);
    expect(assignmentProblems(good, roomLeak, 3, now)).toEqual(["Already has 3 active jobs (max 3)"]);
    expect(assignmentProblems(good, roomLeak, 2, now)).toEqual([]);
  });

  it("rejects non-contractors, disabled accounts, uncleared checks and ended contracts", () => {
    expect(assignmentProblems({ ...good, role: "STUDENT" }, roomLeak, 0, now)).toContain("Account is not an active contractor");
    expect(assignmentProblems({ ...good, disabledAt: days(-1) }, roomLeak, 0, now)).toContain("Account is not an active contractor");
    expect(assignmentProblems({ ...good, backgroundCheckStatus: "PENDING" }, roomLeak, 0, now)).toContain("Background check is not cleared");
    expect(assignmentProblems({ ...good, contractEndsAt: days(-1) }, roomLeak, 0, now)).toContain("Contract has ended");
  });
});

describe("credential warnings", () => {
  it("warns within 30 days and after expiry", () => {
    expect(credentialWarnings({ licenseExpiresAt: days(200), insuranceExpiresAt: days(100) }, now)).toEqual([]);
    expect(credentialWarnings({ licenseExpiresAt: days(12), insuranceExpiresAt: days(100) }, now)).toEqual(["License expires in 12 days"]);
    expect(credentialWarnings({ licenseExpiresAt: days(-2), insuranceExpiresAt: null }, now)).toEqual(["License has expired", "Insurance is missing"]);
  });
});

describe("who may sign in", () => {
  const profile = { backgroundCheckStatus: "CLEARED", contractEndsAt: days(30) };
  it("blocks disabled accounts and ineligible contractors", () => {
    expect(signInBlockReason({ role: "STUDENT", disabledAt: null }, now)).toBeNull();
    expect(signInBlockReason({ role: "STAFF", disabledAt: days(-1) }, now)).toBe("account disabled");
    expect(signInBlockReason({ role: "CONTRACTOR", disabledAt: null, contractorProfile: profile }, now)).toBeNull();
    expect(signInBlockReason({ role: "CONTRACTOR", disabledAt: null, contractorProfile: { ...profile, backgroundCheckStatus: "EXPIRED" } }, now)).toMatch(/background check/);
    expect(signInBlockReason({ role: "CONTRACTOR", disabledAt: null, contractorProfile: { ...profile, contractEndsAt: days(-1) } }, now)).toBe("contract ended");
    expect(signInBlockReason({ role: "CONTRACTOR", disabledAt: null, contractorProfile: null }, now)).toMatch(/no profile/);
  });
});
