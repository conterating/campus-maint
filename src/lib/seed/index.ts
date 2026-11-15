// Builds the demo database. Tickets are replayed in time order through the same
// service functions the app uses (create, me too, staff updates, escalation), so
// seeded data obeys exactly the same rules as live data.
import type { PrismaClient } from "@prisma/client";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";
import { routeTicket } from "@/config/routing";
import { locationTypeFor, type Role } from "@/lib/domain";
import {
  addMeToo,
  confirmResolution,
  contractorAddNote,
  contractorFinishWork,
  contractorStartWork,
  createTicket,
  reopenTicket,
  runEscalationSweep,
  staffAddNote,
  staffOverride,
  staffReassign,
  staffSetStatus,
} from "@/lib/tickets";
import { ALL_PERMISSIONS, type StaffPermissions, type Viewer } from "@/lib/visibility";
import { ASSETS, BUILDINGS, SPACES, TICKETS, USERS, type Step, type TicketSeed, type UserSeed } from "./data";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Fallback when SEED_DEMO_PASSWORD isn't set. Fine for a laptop demo, never for a real deployment. */
export const FALLBACK_DEMO_PASSWORD = "buzz-fixes-everything";

export function demoPassword(): string {
  const p = process.env.SEED_DEMO_PASSWORD?.trim();
  return p && p.length >= 12 ? p : FALLBACK_DEMO_PASSWORD;
}

/**
 * The seeded administrator's authenticator secret, so you can sign in as the
 * admin on a fresh database. `npm run demo:totp` prints the current code.
 * Demo data only: reset it from /account/security on anything real.
 */
export const DEMO_ADMIN_TOTP_SECRET = "RamblinReprsDemoTotpSecret2026xx";
export const DEMO_ADMIN_BACKUP_CODES = ["demo1-codes", "demo2-codes", "demo3-codes", "demo4-codes", "demo5-codes"];

export async function wipeDatabase(db: PrismaClient) {
  await db.auditLog.deleteMany();
  await db.workLog.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.twoFactor.deleteMany();
  await db.verification.deleteMany();
  await db.rateLimit.deleteMany();
  await db.contractorProfile.deleteMany();
  await db.staffProfile.deleteMany();
  await db.notification.deleteMany();
  await db.follow.deleteMany();
  await db.meToo.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticket.deleteMany();
  await db.user.deleteMany();
  await db.asset.deleteMany();
  await db.space.deleteMany();
  await db.building.deleteMany();
  await db.setting.deleteMany();
}

export async function seedReferenceData(db: PrismaClient, now: Date = new Date()) {
  await db.building.createMany({ data: BUILDINGS });
  await db.space.createMany({ data: SPACES });
  await db.asset.createMany({ data: ASSETS });
  const admin = USERS.find((u) => u.role === "ADMIN");
  await db.user.createMany({
    data: USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarHue: u.avatarHue,
      department: u.department ?? null,
      isSupervisor: u.isSupervisor ?? false,
      residenceBuildingId: u.residenceBuildingId ?? null,
      roomId: u.roomId ?? null,
      username: u.username,
      displayUsername: u.username,
      gtId: u.gtId ?? null,
      firstName: u.firstName,
      lastName: u.lastName,
      preferredName: u.preferredName ?? null,
      gender: u.gender ?? null,
      studentYear: u.studentYear ?? null,
      phone: u.phone ?? null,
      // Seeded students have had their rooms confirmed by Housing.
      residenceVerified: u.role === "STUDENT" && !!u.roomId,
      residenceVerifiedAt: u.role === "STUDENT" && u.roomId ? new Date(now.getTime() - 60 * DAY) : null,
      residenceVerifiedById: u.role === "STUDENT" && u.roomId ? "u-linda" : null,
      termsAcceptedAt: new Date(now.getTime() - 90 * DAY),
      emailVerified: true,
      createdAt: new Date(now.getTime() - 90 * DAY),
      updatedAt: new Date(now.getTime() - 90 * DAY),
    })),
  });

  // One password for every demo account (hashed once with Better Auth's scrypt).
  const hash = await hashPassword(demoPassword());
  await db.account.createMany({
    data: USERS.map((u) => ({
      id: `acct-${u.id}`,
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: hash,
      createdAt: new Date(now.getTime() - 90 * DAY),
      updatedAt: new Date(now.getTime() - 90 * DAY),
    })),
  });

  for (const u of USERS) {
    if (u.contractor) {
      const c = u.contractor;
      await db.contractorProfile.create({
        data: {
          userId: u.id,
          contractorId: c.contractorId,
          companyName: c.companyName,
          companyPhone: c.companyPhone ?? null,
          trades: c.trades.join(","),
          departments: c.departments.join(","),
          licenseNumber: c.licenseNumber,
          licenseExpiresAt: new Date(now.getTime() + c.licenseExpiresInDays * DAY),
          insuranceExpiresAt: new Date(now.getTime() + c.insuranceExpiresInDays * DAY),
          backgroundCheckStatus: c.backgroundCheckStatus,
          backgroundCheckedAt: c.backgroundCheckStatus === "CLEARED" ? new Date(now.getTime() - 120 * DAY) : null,
          residenceHallAccess: c.residenceHallAccess,
          availability: c.availability,
          maxActiveJobs: c.maxActiveJobs,
          hourlyRate: c.hourlyRate,
          contractStartsAt: new Date(now.getTime() - 365 * DAY),
          contractEndsAt: new Date(now.getTime() + 365 * DAY),
        },
      });
    }
    if (u.staff) {
      const perms = permissionsFor(u);
      await db.staffProfile.create({
        data: {
          userId: u.id,
          employeeId: u.staff.employeeId,
          title: u.staff.title,
          officePhone: u.staff.officePhone ?? null,
          officeLocation: u.staff.officeLocation ?? null,
          ...perms,
        },
      });
    }
  }

  // The admin must use two-factor sign-in. Enroll the demo secret (encrypted the
  // same way Better Auth stores it) so a fresh database can still be signed into.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (admin && secret) {
    await db.twoFactor.create({
      data: {
        id: `2fa-${admin.id}`,
        userId: admin.id,
        secret: await symmetricEncrypt({ key: secret, data: DEMO_ADMIN_TOTP_SECRET }),
        backupCodes: await symmetricEncrypt({ key: secret, data: JSON.stringify(DEMO_ADMIN_BACKUP_CODES) }),
        verified: true,
      },
    });
    await db.user.update({ where: { id: admin.id }, data: { twoFactorEnabled: true } });
  }

  if (admin) {
    const at = (h: number) => new Date(now.getTime() - h * HOUR);
    await db.auditLog.createMany({
      data: [
        { actorId: admin.id, action: "CONTRACTOR_CREATED", targetType: "User", targetId: "u-victor", after: JSON.stringify({ companyName: "Ramos Plumbing", backgroundCheckStatus: "PENDING" }), createdAt: at(72) },
        { actorId: admin.id, action: "PERMISSIONS_CHANGED", targetType: "User", targetId: "u-rosa", before: JSON.stringify({ canManageContractors: false }), after: JSON.stringify({ canManageContractors: true }), createdAt: at(240) },
        { actorId: "u-linda", action: "RESIDENCE_VERIFIED", targetType: "User", targetId: "u-hana", after: JSON.stringify({ residenceBuildingId: "b-glc", roomId: "s-glc-618" }), createdAt: at(600) },
        { actorId: admin.id, action: "ROLE_CHANGED", targetType: "User", targetId: "u-terrence", before: JSON.stringify({ role: "STAFF" }), after: JSON.stringify({ role: "CONTRACTOR" }), createdAt: at(800) },
      ],
    });
  }
}

function permissionsFor(u: UserSeed): StaffPermissions {
  if (u.role === "ADMIN") return ALL_PERMISSIONS;
  return {
    canManageUsers: u.staff?.canManageUsers ?? false,
    canManageContractors: u.staff?.canManageContractors ?? false,
    canVerifyResidence: u.staff?.canVerifyResidence ?? false,
    canViewAnalytics: u.staff?.canViewAnalytics ?? false,
    canAssignWork: u.staff?.canAssignWork ?? true,
  };
}

export function viewerFromSeed(id: string): Viewer {
  const u = USERS.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown seed user ${id}`);
  return {
    id: u.id,
    name: u.name,
    role: u.role as Role,
    department: u.department ?? null,
    isSupervisor: u.isSupervisor ?? false,
    residenceBuildingId: u.residenceBuildingId ?? null,
    roomId: u.roomId ?? null,
    permissions: u.staff ? permissionsFor(u) : undefined,
    residenceVerified: u.role === "STUDENT" ? !!u.roomId : undefined,
  };
}

/** The department's supervisor: dispatches, reassigns, overrides, writes internal notes. */
function supervisorFor(department: string): Viewer {
  const sup = USERS.find((u) => u.role === "STAFF" && u.department === department && u.isSupervisor);
  if (!sup) throw new Error(`No supervisor for ${department}`);
  return viewerFromSeed(sup.id);
}

/** The contractor who works the department's jobs in the sample history. */
function contractorFor(department: string): Viewer {
  const c = USERS.find((u) => u.contractor?.departments.includes(department as never) && u.contractor.backgroundCheckStatus === "CLEARED");
  if (!c) throw new Error(`No contractor for ${department}`);
  return viewerFromSeed(c.id);
}

type Op = { at: number; order: number; run: () => Promise<void> };

export async function seedDatabase(db: PrismaClient, opts: { now?: Date; quiet?: boolean; preserveUserId?: string } = {}) {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  // "Reset demo data" keeps the signed-in admin's session, password and
  // authenticator, so they stay signed in and can sign in again afterwards.
  // Everyone else's sessions survive too (seeded ids are stable), so people
  // signed in on other devices aren't thrown out by a demo reset.
  const otherSessions = opts.preserveUserId ? await db.session.findMany({ where: { userId: { not: opts.preserveUserId } } }) : [];
  const keep = opts.preserveUserId
    ? await Promise.all([
        db.session.findMany({ where: { userId: opts.preserveUserId } }),
        db.account.findMany({ where: { userId: opts.preserveUserId } }),
        db.twoFactor.findMany({ where: { userId: opts.preserveUserId } }),
        db.user.findUnique({ where: { id: opts.preserveUserId }, select: { twoFactorEnabled: true } }),
      ])
    : null;
  await wipeDatabase(db);
  await seedReferenceData(db, now);
  if (keep && USERS.some((u) => u.id === opts.preserveUserId)) {
    const [sessions, accounts, factors, flags] = keep;
    const id = opts.preserveUserId!;
    await db.account.deleteMany({ where: { userId: id } });
    await db.twoFactor.deleteMany({ where: { userId: id } });
    if (accounts.length) await db.account.createMany({ data: accounts });
    if (factors.length) await db.twoFactor.createMany({ data: factors });
    if (sessions.length) await db.session.createMany({ data: sessions });
    await db.user.update({ where: { id }, data: { twoFactorEnabled: flags?.twoFactorEnabled ?? false } });
    const seeded = new Set(USERS.map((u) => u.id));
    const restorable = otherSessions.filter((x) => seeded.has(x.userId));
    if (restorable.length) await db.session.createMany({ data: restorable });
  }

  const ops: Op[] = [];
  TICKETS.forEach((spec, i) => planTicket(db, spec, i, nowMs, ops));
  ops.sort((a, b) => a.at - b.at || a.order - b.order);

  // Run the escalation sweep on the hour throughout the seeded history, plus
  // before every operation, so late tickets escalate at the right moment.
  let nextTick = Math.ceil((ops[0]?.at ?? nowMs) / HOUR) * HOUR;
  for (const op of ops) {
    while (nextTick <= op.at) {
      await runEscalationSweep(db, new Date(nextTick));
      nextTick += HOUR;
    }
    await runEscalationSweep(db, new Date(op.at));
    await op.run();
  }
  while (nextTick <= nowMs) {
    await runEscalationSweep(db, new Date(nextTick));
    nextTick += HOUR;
  }
  await runEscalationSweep(db, now);

  // Older notifications have been read; the last half day is still fresh.
  await db.notification.updateMany({ where: { createdAt: { lt: new Date(nowMs - 12 * HOUR) } }, data: { read: true } });

  const count = await db.ticket.count();
  if (!opts.quiet) console.log(`Seeded ${BUILDINGS.length} buildings, ${USERS.length} users, ${count} tickets.`);
  return { tickets: count };
}

function planTicket(db: PrismaClient, spec: TicketSeed, index: number, nowMs: number, ops: Op[]) {
  const created = nowMs - spec.age * HOUR;
  const ref = { id: "", reporter: viewerFromSeed(spec.by) };

  ops.push({
    at: created,
    order: index * 100,
    run: async () => {
      const building = BUILDINGS.find((b) => b.id === spec.b)!;
      const space = SPACES.find((s) => s.id === spec.s);
      const locType = locationTypeFor(building.kind, space?.scope);
      const aiCategory = spec.ai?.cat ?? spec.cat;
      const aiSeverity = spec.ai?.sev ?? spec.sev;
      const { id } = await createTicket(
        db,
        ref.reporter,
        {
          buildingId: spec.b,
          spaceId: spec.s ?? null,
          assetId: spec.a ?? null,
          description: spec.desc,
          category: spec.cat,
          severity: spec.sev,
          summary: spec.sum,
          ai: {
            category: aiCategory,
            severity: aiSeverity,
            department: routeTicket(aiCategory, locType).department,
            summary: spec.sum,
            source: "claude",
            rationale: "Classified from the report text and location.",
          },
        },
        new Date(created),
      );
      ref.id = id;
      if (spec.untriaged) {
        await db.ticket.update({ where: { id }, data: { status: "SUBMITTED", updatedAt: new Date(created) } });
        await db.ticketEvent.deleteMany({ where: { ticketId: id, toStatus: "TRIAGED" } });
      }
    },
  });

  (spec.steps ?? []).forEach((step, j) => {
    ops.push({ at: created + step.t * HOUR, order: index * 100 + j + 1, run: () => runStep(db, ref, step, new Date(created + step.t * HOUR)) });
  });
}

const SAMPLE_MATERIALS = ["Replacement parts", "Gasket and fasteners", "Ballasts (2)", "Cartridge set", "Sealant and paint"];

async function runStep(db: PrismaClient, ref: { id: string; reporter: Viewer }, step: Step, at: Date) {
  const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ref.id } });
  const sup = supervisorFor(ticket.department);
  const worker = () => (ticket.assigneeId ? viewerFromSeed(ticket.assigneeId) : contractorFor(ticket.department));
  switch (step.do) {
    case "assign":
      // The supervisor dispatches the job to the department's contractor.
      await staffSetStatus(db, sup, ref.id, { status: "ASSIGNED", assigneeId: contractorFor(ticket.department).id, note: step.note }, at);
      break;
    case "start":
      await contractorStartWork(db, worker(), ref.id, step.note ?? null, at);
      break;
    case "resolve": {
      const w = worker();
      if (!(await db.workLog.findFirst({ where: { ticketId: ref.id, contractorId: w.id, endedAt: null } }))) {
        await contractorStartWork(db, w, ref.id, null, new Date(at.getTime() - 50 * 60_000));
      }
      await contractorFinishWork(
        db,
        w,
        ref.id,
        { notes: step.note ?? null, materials: SAMPLE_MATERIALS[ticket.number % SAMPLE_MATERIALS.length], materialsCost: 12 + ((ticket.number * 7) % 60) },
        at,
      );
      break;
    }
    case "note":
      if (step.internal || !ticket.assigneeId) await staffAddNote(db, sup, ref.id, step.text, step.internal ?? false, at);
      else await contractorAddNote(db, worker(), ref.id, step.text, at);
      break;
    case "metoo":
      await addMeToo(db, viewerFromSeed(step.who), ref.id, at);
      break;
    case "confirm":
      await confirmResolution(db, ref.reporter, ref.id, at);
      break;
    case "reopen":
      await reopenTicket(db, ref.reporter, ref.id, step.reason, at);
      break;
    case "reassign":
      await staffReassign(db, sup, ref.id, step.dept, step.reason, at);
      break;
    case "override":
      await staffOverride(db, sup, ref.id, { severity: step.sev, category: step.cat, reason: step.reason }, at);
      break;
  }
}
