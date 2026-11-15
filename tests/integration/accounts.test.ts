// Accounts end to end through the real services and Better Auth (auth.api),
// against the seeded test database.
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, db, reseed } from "../support/db";
import { auth } from "@/lib/auth";
import { DEV_OUTBOX } from "@/lib/email";
import { attemptLogin } from "@/lib/sign-in";
import { registerStudent } from "@/lib/registration";
import { acceptInvite, createContractor, createStaffAccount, decideResidence, setAccountDisabled, updateStaffAccount } from "@/lib/accounts";
import { canSeePhoto } from "@/lib/photo-access";
import {
  contractorAddNote,
  contractorFinishWork,
  contractorSetStatus,
  contractorStartWork,
  createTicket,
  staffOverride,
  staffReassign,
  staffSetStatus,
} from "@/lib/tickets";
import { TICKETS, USERS } from "@/lib/seed/data";
import { demoPassword } from "@/lib/seed";
import type { SignupInput } from "@/lib/auth-schemas";

let now: Date;
beforeEach(async () => {
  now = await reseed();
});
afterAll(() => db.$disconnect());

const H = 3_600_000;
const later = (h: number) => new Date(now.getTime() + h * H);
const PW = demoPassword();
const login = (username: string, password = PW, tab: "student" | "contractor" | "staff" = "student") => attemptLogin({ username, password, tab }, new Headers());

const student: SignupInput = {
  firstName: "George",
  lastName: "Burdell",
  preferredName: "Buzz",
  username: "gburdell3",
  gtId: "903999001",
  password: "ramblin wreck from tech",
  confirmPassword: "ramblin wreck from tech",
  gender: "SELF_DESCRIBE",
  genderSelfDescribe: "Yellow jacket",
  studentYear: "THIRD",
  residenceBuildingId: "b-glenn",
  roomNumber: "216",
  phone: "404-555-0199",
  acceptTerms: true,
};

function lastEmailLink(to: string, kind: string): string {
  const lines = readFileSync(DEV_OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; kind: string; link: string });
  const hit = lines.reverse().find((m) => m.to === to && m.kind === kind);
  if (!hit) throw new Error(`No ${kind} email to ${to}`);
  return hit.link;
}

const leak = {
  buildingId: "b-glenn",
  spaceId: "s-gln-214",
  description: "Water is leaking from under the bathroom sink and pooling on the floor.",
  category: "PLUMBING",
  severity: "URGENT",
  summary: "Leak under the sink",
  ai: { category: "PLUMBING", severity: "URGENT", department: "HOUSING", summary: "Leak", source: "keywords" as const },
};

describe("sign-up", () => {
  it("creates an unverified STUDENT with every field saved", async () => {
    const res = await registerStudent(student, new Headers());
    expect(res).toEqual({ ok: true, data: { email: "gburdell3@gatech.edu" } });
    const u = await db.user.findUniqueOrThrow({ where: { username: "gburdell3" }, include: { accounts: true } });
    expect(u).toMatchObject({
      role: "STUDENT",
      email: "gburdell3@gatech.edu",
      emailVerified: false,
      name: "Buzz Burdell",
      firstName: "George",
      lastName: "Burdell",
      preferredName: "Buzz",
      gtId: "903999001",
      gender: "SELF_DESCRIBE",
      genderSelfDescribe: "Yellow jacket",
      studentYear: "THIRD",
      phone: "(404) 555-0199",
      residenceBuildingId: "b-glenn",
      roomId: "s-gln-216",
      residenceVerified: false,
      department: null,
      isSupervisor: false,
      disabledAt: null,
    });
    expect(u.termsAcceptedAt).toBeInstanceOf(Date);
    // Hashed with scrypt, never stored in plain text.
    expect(u.accounts[0].password).toBeTruthy();
    expect(u.accounts[0].password).not.toContain(student.password);
    expect(lastEmailLink("gburdell3@gatech.edu", "verify")).toMatch(/\/api\/auth\/verify-email\?token=/);
  });

  it("can't set role, department, or residenceVerified from input", async () => {
    // Better Auth drops `input: false` fields (and the HTTP sign-up endpoint is disabled entirely).
    await auth.api
      .signUpEmail({
        body: { name: "Mallory", email: "mallory1@gatech.edu", password: "a long enough password", username: "mallory1", role: "ADMIN", department: "HOUSING", isSupervisor: true, residenceVerified: true, disabledAt: null } as never,
      })
      .catch(() => null);
    const mallory = await db.user.findUnique({ where: { username: "mallory1" } });
    if (mallory) expect(mallory).toMatchObject({ role: "STUDENT", department: null, isSupervisor: false, residenceVerified: false });
    await registerStudent({ ...student, role: "ADMIN", department: "HOUSING", residenceVerified: true } as SignupInput, new Headers());
    expect(await db.user.findUniqueOrThrow({ where: { username: "gburdell3" } })).toMatchObject({ role: "STUDENT", department: null, residenceVerified: false });
  });

  it("rejects a duplicate username or GT ID", async () => {
    const dupUser = await registerStudent({ ...student, username: "mpatel3" }, new Headers());
    expect(dupUser).toMatchObject({ ok: false, code: "DUPLICATE", error: "An account already exists for this username." });
    const dupId = await registerStudent({ ...student, gtId: "903100101" }, new Headers());
    expect(dupId).toMatchObject({ ok: false, code: "DUPLICATE", error: "An account already exists for this GT ID." });
  });

  it("matches a typed room number to the hall's room, or adds the room to that hall", async () => {
    // "216" is already Glenn's Room 216.
    await registerStudent(student, new Headers());
    expect((await db.user.findUniqueOrThrow({ where: { username: "gburdell3" } })).roomId).toBe("s-gln-216");

    // "305" exists in Towers, not Glenn: it becomes a new Glenn room, never Towers' 305.
    await registerStudent({ ...student, username: "gburdell4", gtId: "903999002", roomNumber: "Room 305" }, new Headers());
    const u = await db.user.findUniqueOrThrow({ where: { username: "gburdell4" }, include: { room: true } });
    expect(u.room).toMatchObject({ buildingId: "b-glenn", scope: "DORM_ROOM", label: "Room 305", floor: 3 });
    expect(u.roomId).not.toBe("s-twr-305");
    expect(u.residenceVerified).toBe(false);
    // A second student typing the same number shares that room record.
    await registerStudent({ ...student, username: "gburdell5", gtId: "903999003", roomNumber: "305" }, new Headers());
    expect((await db.user.findUniqueOrThrow({ where: { username: "gburdell5" } })).roomId).toBe(u.roomId);
  });

  it("rejects a hall that isn't a residence hall and a room that isn't a number", async () => {
    const notAHall = await registerStudent({ ...student, residenceBuildingId: "b-library" }, new Headers());
    expect(notAHall).toMatchObject({ ok: false, fieldErrors: { residenceBuildingId: expect.any(String) } });
    const badRoom = await registerStudent({ ...student, roomNumber: "near the stairs" }, new Headers());
    expect(badRoom).toMatchObject({ ok: false, fieldErrors: { roomNumber: expect.any(String) } });
    expect(await db.user.count({ where: { username: "gburdell3" } })).toBe(0);
  });

  it("must verify email before signing in, then lands on the student home", async () => {
    await registerStudent(student, new Headers());
    expect(await login("gburdell3", student.password)).toMatchObject({ ok: false, code: "EMAIL_NOT_VERIFIED" });
    const token = new URL(lastEmailLink("gburdell3@gatech.edu", "verify")).searchParams.get("token")!;
    await auth.api.verifyEmail({ query: { token } });
    const res = await login("GBurdell3@gatech.edu", student.password);
    expect(res).toEqual({ ok: true, data: { redirectTo: "/" } });
    expect((await db.user.findUniqueOrThrow({ where: { username: "gburdell3" } })).lastLoginAt).toBeInstanceOf(Date);
  });
});

describe("sign-in", () => {
  it("redirects by the role in the database, whatever tab was used", async () => {
    expect(await login("mpatel3", PW, "staff")).toEqual({ ok: true, data: { redirectTo: "/" } });
    expect(await login("twallace", PW, "student")).toEqual({ ok: true, data: { redirectTo: "/jobs" } });
    expect(await login("lokafor3", PW, "contractor")).toEqual({ ok: true, data: { redirectTo: "/staff" } });
  });

  it("uses one generic error for a wrong password and an unknown username", async () => {
    const wrong = await login("mpatel3", "not the right password");
    const unknown = await login("nobody123", "not the right password");
    expect(wrong).toEqual({ ok: false, error: "Username or password is incorrect." });
    expect(unknown).toEqual(wrong);
  });

  it("locks a username after 5 failures in 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await login("jlee42", "wrong password " + i)).ok).toBe(false);
    const locked = await login("jlee42", PW);
    expect(locked).toMatchObject({ ok: false, code: "LOCKED" });
    // Other usernames aren't affected.
    expect((await login("mpatel3")).ok).toBe(true);
  });

  it("refuses disabled accounts and ineligible contractors with the same message", async () => {
    await setAccountDisabled(db, as("u-elena"), "u-ethan", true);
    expect(await login("ebrooks7")).toEqual({ ok: false, error: "Username or password is incorrect." });
    // Pending background check.
    expect(await login("vramos", PW, "contractor")).toEqual({ ok: false, error: "Username or password is incorrect." });
    // Contract ended.
    await db.contractorProfile.update({ where: { userId: "u-grace" }, data: { contractEndsAt: later(-1) } });
    expect(await login("gliu", PW, "contractor")).toEqual({ ok: false, error: "Username or password is incorrect." });
    // And no session was created for any of them.
    expect(await db.session.count({ where: { userId: { in: ["u-ethan", "u-victor", "u-grace"] } } })).toBe(0);
  });

  it("asks admins for their code, and sends an admin without 2FA to enroll", async () => {
    expect(await login("evasquez1", PW, "staff")).toEqual({ ok: true, data: { twoFactor: true } });
    expect(await db.session.count({ where: { userId: "u-elena" } })).toBe(0);
    await db.twoFactor.deleteMany({ where: { userId: "u-elena" } });
    await db.user.update({ where: { id: "u-elena" }, data: { twoFactorEnabled: false } });
    expect(await login("evasquez1", PW, "staff")).toEqual({ ok: true, data: { redirectTo: "/account/security?enroll=1" } });
  });

  it("caps staff sessions at 12 hours", async () => {
    await login("lokafor3", PW, "staff");
    const s = await db.session.findFirstOrThrow({ where: { userId: "u-linda" } });
    expect(s.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * H + 5000);
  });

  it("resets a password with a single-use link and signs out other sessions", async () => {
    await login("mpatel3");
    expect(await db.session.count({ where: { userId: "u-maya" } })).toBe(1);
    await auth.api.requestPasswordReset({ body: { email: "mpatel3@gatech.edu", redirectTo: "/reset-password" } });
    const token = new URL(lastEmailLink("mpatel3@gatech.edu", "reset")).searchParams.get("token")!;
    await auth.api.resetPassword({ body: { token, newPassword: "a brand new passphrase" } });
    expect(await db.session.count({ where: { userId: "u-maya" } })).toBe(0);
    await expect(auth.api.resetPassword({ body: { token, newPassword: "and another passphrase" } })).rejects.toBeTruthy();
    expect((await login("mpatel3")).ok).toBe(false);
    expect((await login("mpatel3", "a brand new passphrase")).ok).toBe(true);
  });
});

describe("contractors", () => {
  it("can't reassign, override, or act on tickets that aren't theirs", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now);
    await expect(staffReassign(db, as("u-terrence"), id, "IT", null, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staffOverride(db, as("u-terrence"), id, { severity: "LOW" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(contractorStartWork(db, as("u-terrence"), id, null, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(contractorAddNote(db, as("u-terrence"), id, "hello", now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1));
    await expect(contractorSetStatus(db, as("u-terrence"), id, "ASSIGNED", null, later(2))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(contractorStartWork(db, as("u-marcus"), id, null, later(2))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(contractorFinishWork(db, as("u-terrence"), id, {}, later(2))).rejects.toThrow(/Start work/);
  });

  it("assignment rejects ineligible contractors and accepts eligible ones", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now);
    const assign = (who: string) => staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: who }, later(1));
    await expect(assign("u-victor")).rejects.toThrow(/Background check/);
    await expect(assign("u-kevin")).rejects.toThrow(/department/);
    await db.contractorProfile.update({ where: { userId: "u-terrence" }, data: { residenceHallAccess: false } });
    await expect(assign("u-terrence")).rejects.toThrow(/residence halls/);
    await db.contractorProfile.update({ where: { userId: "u-terrence" }, data: { residenceHallAccess: true, insuranceExpiresAt: later(-1) } });
    await expect(assign("u-terrence")).rejects.toThrow(/Insurance/);
    await db.contractorProfile.update({ where: { userId: "u-terrence" }, data: { insuranceExpiresAt: later(1000), maxActiveJobs: 1 } });
    await expect(assign("u-terrence")).rejects.toThrow(/active jobs/);
    await db.contractorProfile.update({ where: { userId: "u-terrence" }, data: { maxActiveJobs: 30, availability: "OFF_DUTY" } });
    await expect(assign("u-terrence")).rejects.toThrow(/Off duty/);
    await db.contractorProfile.update({ where: { userId: "u-terrence" }, data: { availability: "AVAILABLE" } });
    await assign("u-terrence");
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).assigneeId).toBe("u-terrence");
  });

  it("start and finish update status, timestamps and the work log, and notify the student", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now);
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1));
    await contractorStartWork(db, as("u-terrence"), id, null, later(2));
    expect(await db.ticket.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "IN_PROGRESS" });
    expect((await db.contractorProfile.findUniqueOrThrow({ where: { userId: "u-terrence" } })).availability).toBe("ON_JOB");
    await contractorFinishWork(db, as("u-terrence"), id, { materials: "Washer", materialsCost: 3, notes: "Tightened the fitting", completionPhotoUrl: null }, later(2.5));
    const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { workLogs: true } });
    expect(t).toMatchObject({ status: "RESOLVED", resolvedAt: later(2.5) });
    expect(t.workLogs[0]).toMatchObject({ minutes: 30, roomEnteredAt: later(2), roomExitedAt: later(2.5), materials: "Washer", notes: "Tightened the fitting" });
    const msgs = (await db.notification.findMany({ where: { ticketId: id, userId: "u-maya" } })).map((n) => n.message);
    expect(msgs.some((m) => /contractor \(Terrence W\.\) is assigned/.test(m))).toBe(true);
    expect(msgs.some((m) => /Work has started/.test(m))).toBe(true);
    expect(msgs.some((m) => /is resolved/.test(m))).toBe(true);
  });
});

describe("seeded data", () => {
  it("keeps every ticket linked to the right reporter, owner, and assignee", async () => {
    const tickets = await db.ticket.findMany({ include: { assignee: true } });
    expect(tickets).toHaveLength(TICKETS.length);
    TICKETS.forEach((spec) => {
      const t = tickets.find((x) => x.description === spec.desc && x.buildingId === spec.b)!;
      expect(t, spec.sum).toBeDefined();
      expect(t.reporterId, `ticket ${t.number}`).toBe(spec.by);
      expect(t.ownerUserId).toBe(t.ownerType === "STUDENT" ? spec.by : null);
      if (spec.steps?.some((s) => s.do === "assign")) {
        expect(t.assignee?.role, `ticket ${t.number} assignee`).toBe("CONTRACTOR");
      }
    });
    for (const spec of TICKETS) {
      for (const step of spec.steps ?? []) {
        if (step.do !== "metoo") continue;
        expect(await db.meToo.count({ where: { userId: step.who, ticket: { reporterId: spec.by, description: spec.desc } } })).toBe(1);
      }
    }
    const resolvedWithWork = await db.ticket.count({ where: { status: { in: ["RESOLVED", "CONFIRMED"] }, workLogs: { some: { endedAt: { not: null } } } } });
    expect(resolvedWithWork).toBeGreaterThan(5);
  });

  it("gives every user a username and every contractor/staff member a profile", async () => {
    const users = await db.user.findMany({ include: { contractorProfile: true, staffProfile: true, accounts: true } });
    expect(users).toHaveLength(USERS.length);
    for (const u of users) {
      expect(u.username, u.id).toBeTruthy();
      expect(u.emailVerified).toBe(true);
      expect(u.accounts).toHaveLength(1);
      if (u.role === "CONTRACTOR") expect(u.contractorProfile, u.id).not.toBeNull();
      if (u.role === "STAFF" || u.role === "ADMIN") expect(u.staffProfile, u.id).not.toBeNull();
      if (u.role !== "CONTRACTOR") expect(u.gtId, u.id).toMatch(/^90\d{7}$/);
    }
    expect(await db.auditLog.count()).toBeGreaterThan(0);
  });
});

describe("administration", () => {
  it("creates a contractor with an invite, writes the audit log, and the invite works once", async () => {
    const admin = as("u-elena");
    const user = await createContractor(db, admin, {
      firstName: "Ana",
      lastName: "Lopez",
      username: "alopez",
      email: "ana@lopezhvac.test",
      contractorId: "C-2001",
      companyName: "Lopez HVAC",
      trades: ["HVAC"],
      departments: ["FACILITIES"],
      licenseExpiresAt: "2030-01-01",
      insuranceExpiresAt: "2030-01-01",
      backgroundCheckStatus: "CLEARED",
      residenceHallAccess: false,
      maxActiveJobs: 4,
      hourlyRate: 61,
    });
    expect(await db.contractorProfile.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ trades: "HVAC", departments: "FACILITIES", hourlyRate: 61 });
    const audit = await db.auditLog.findMany({ where: { targetId: user.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(["CONTRACTOR_CREATED", "INVITE_SENT"]);
    expect(audit.find((a) => a.action === "CONTRACTOR_CREATED")!.after).not.toContain("61");

    const token = new URL(lastEmailLink("ana@lopezhvac.test", "invite")).searchParams.get("token")!;
    expect(await acceptInvite(db, token, "lopez hvac password")).toEqual({ ok: true });
    expect((await acceptInvite(db, token, "another good password")).ok).toBe(false);
    expect(await login("alopez", "lopez hvac password", "contractor")).toEqual({ ok: true, data: { redirectTo: "/jobs" } });
  });

  it("changing a role or permissions is audited and signs the person out", async () => {
    await login("rdelgado7", PW, "staff");
    expect(await db.session.count({ where: { userId: "u-rosa" } })).toBe(1);
    await updateStaffAccount(db, as("u-elena"), { userId: "u-rosa", role: "STAFF", department: "FACILITIES", isSupervisor: true, canManageUsers: true, canManageContractors: true, canVerifyResidence: false, canViewAnalytics: true, canAssignWork: true });
    expect(await db.session.count({ where: { userId: "u-rosa" } })).toBe(0);
    const row = await db.auditLog.findFirstOrThrow({ where: { targetId: "u-rosa", action: "PERMISSIONS_CHANGED" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(row.before!)).toMatchObject({ canManageUsers: false });
    expect(JSON.parse(row.after!)).toMatchObject({ canManageUsers: true });
  });

  it("only people with the permission can manage accounts", async () => {
    const input = { role: "STAFF", firstName: "A", lastName: "B", username: "abee1", gtId: "902299999", department: "IT", employeeId: "E-9", title: "Tech" };
    await expect(createStaffAccount(db, as("u-aisha"), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createStaffAccount(db, as("u-maya"), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createContractor(db, as("u-linda"), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setAccountDisabled(db, as("u-terrence"), "u-maya", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await createStaffAccount(db, as("u-elena"), input);
    expect(await db.staffProfile.findUniqueOrThrow({ where: { userId: created.id } })).toMatchObject({ employeeId: "E-9", title: "Tech" });
    expect(await db.auditLog.count({ where: { targetId: created.id, action: "ACCOUNT_CREATED" } })).toBe(1);
  });

  it("Housing verifies a residence: recorded, audited, and the student is notified", async () => {
    await registerStudent(student, new Headers());
    const u = await db.user.findUniqueOrThrow({ where: { username: "gburdell3" } });
    await expect(decideResidence(db, as("u-aisha"), { userId: u.id, decision: "verify" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideResidence(db, as("u-linda"), { userId: u.id, decision: "verify" }, now);
    expect(await db.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ residenceVerified: true, residenceVerifiedById: "u-linda", residenceVerifiedAt: now });
    expect(await db.auditLog.count({ where: { targetId: u.id, action: "RESIDENCE_VERIFIED", actorId: "u-linda" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: u.id, message: { contains: "confirmed your room" } } })).toBe(1);
  });
});

describe("signed-out visitors", () => {
  const guest = { id: "guest", name: "Guest", role: "STUDENT" as const, department: null, isSupervisor: false, residenceBuildingId: null, roomId: null };
  it("browse public issues only, and only public photos", async () => {
    const { listVisibleTickets } = await import("@/lib/tickets");
    const visible = await listVisibleTickets(db, guest);
    expect(visible.length).toBe(await db.ticket.count({ where: { scope: "PUBLIC" } }));
    expect(visible.every((t) => t.scope === "PUBLIC")).toBe(true);
    const file = "0b5e3c1a-3333-4222-8333-944455556666.jpg";
    const room = await db.ticket.findFirstOrThrow({ where: { scope: "ROOM" } });
    await db.ticket.update({ where: { id: room.id }, data: { photoUrl: `/uploads/${file}` } });
    expect(await canSeePhoto(db, guest, file)).toBe(false);
    const pub = await db.ticket.findFirstOrThrow({ where: { scope: "PUBLIC" } });
    const pubFile = "0b5e3c1a-4444-4222-8333-944455556666.jpg";
    await db.ticket.update({ where: { id: pub.id }, data: { photoUrl: `/uploads/${pubFile}` } });
    expect(await canSeePhoto(db, guest, pubFile)).toBe(true);
    // Unattached uploads aren't served to guests.
    expect(await canSeePhoto(db, guest, "0b5e3c1a-5555-4222-8333-944455556666.jpg")).toBe(false);
  });
});

describe("upload permissions", () => {
  it("serves a photo only to people who can see its ticket", async () => {
    const file = "0b5e3c1a-1111-4222-8333-944455556666.jpg";
    const t = await db.ticket.findFirstOrThrow({ where: { scope: "ROOM", spaceId: "s-gln-214" } });
    await db.ticket.update({ where: { id: t.id }, data: { photoUrl: `/uploads/${file}` } });
    expect(await canSeePhoto(db, as("u-maya"), file)).toBe(true);
    expect(await canSeePhoto(db, as("u-linda"), file)).toBe(true);
    expect(await canSeePhoto(db, as("u-ethan"), file)).toBe(false); // same hall, other room
    expect(await canSeePhoto(db, as("u-sam"), file)).toBe(false); // other hall
    expect(await canSeePhoto(db, as("u-marcus"), file)).toBe(t.assigneeId === "u-marcus");

    const done = "0b5e3c1a-2222-4222-8333-944455556666.jpg";
    const log = await db.workLog.findFirstOrThrow({ where: { endedAt: { not: null }, ticket: { scope: "ROOM" } }, include: { ticket: true } });
    await db.workLog.update({ where: { id: log.id }, data: { completionPhotoUrl: `/uploads/${done}` } });
    expect(await canSeePhoto(db, as(log.contractorId), done)).toBe(log.ticket.assigneeId === log.contractorId);
    expect(await canSeePhoto(db, as("u-alex"), done)).toBe(false);
  });
});
