// Account management: staff/admin accounts, contractors, residence verification,
// disabling accounts, and invite links. Every change writes an AuditLog row, and
// role/permission changes sign the person out everywhere else.
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { appUrl, sendEmail } from "./email";
import { CATEGORIES, DEPARTMENTS, SKILLS, formatKeyList, type Role } from "./domain";
import { can, type Viewer } from "./visibility";
import {
  contractorCreateSchema,
  contractorUpdateSchema,
  emailForUsername,
  fieldErrors,
  staffAccountSchema,
  staffUpdateSchema,
} from "./auth-schemas";
import type * as z from "zod";

type Db = PrismaClient;

export const INVITE_TTL_MS = 72 * 3_600_000;
const INVITE_PREFIX = "invite:";

export class FormError extends AppError {
  constructor(public fields: Record<string, string>) {
    super("Fix the errors below.", "INVALID");
  }
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new FormError(fieldErrors(r.error));
  return r.data;
}

function requirePermission(actor: Viewer, perm: "canManageUsers" | "canManageContractors" | "canVerifyResidence") {
  if (!can(actor, perm)) throw new AppError("You don't have permission to do that.", "FORBIDDEN");
}

const displayName = (first: string, last: string, preferred?: string | null) => `${preferred || first} ${last}`.trim();

async function revokeSessions(db: Db | Prisma.TransactionClient, userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

// ---------------------------------------------------------------------------
// Invites (72-hour, single-use set-password links)
// ---------------------------------------------------------------------------

export async function sendInvite(db: Db, actorId: string, userId: string): Promise<{ token: string; emailOk: boolean }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = randomBytes(32).toString("base64url");
  await db.verification.deleteMany({ where: { identifier: { startsWith: INVITE_PREFIX }, value: userId } });
  await db.verification.create({
    data: { id: randomBytes(12).toString("hex"), identifier: `${INVITE_PREFIX}${token}`, value: userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  const link = appUrl(`/invite?token=${encodeURIComponent(token)}`);
  const sent = await sendEmail({
    kind: "invite",
    to: user.email,
    subject: "You're invited to Ramblin' Repairs",
    text: `An administrator created a Ramblin' Repairs account for you.\n\nYour username: ${user.username}\n\nCreate your password here (the link works once and expires in 72 hours):\n${link}`,
    link,
  });
  await writeAudit(db, { actorId, action: "INVITE_SENT", targetType: "User", targetId: userId });
  return { token, emailOk: sent.ok };
}

export async function inviteTokenUser(db: Db, token: string) {
  const row = await db.verification.findFirst({ where: { identifier: `${INVITE_PREFIX}${token}` } });
  if (!row || row.expiresAt < new Date()) return null;
  return db.user.findUnique({ where: { id: row.value } });
}

/** Set the password from an invite. Consumes the token. */
export async function acceptInvite(db: Db, token: string, password: string): Promise<{ ok: true } | { ok: false; error: string; field?: string }> {
  const row = await db.verification.findFirst({ where: { identifier: `${INVITE_PREFIX}${token}` } });
  if (!row || row.expiresAt < new Date()) return { ok: false, error: "This invite link is invalid or has expired. Ask an administrator to send a new one." };
  if (process.env.HIBP_DISABLED !== "1") {
    try {
      if (await isPasswordCompromised(password)) return { ok: false, error: "That password has appeared in a data breach. Choose a different one.", field: "password" };
    } catch {
      return { ok: false, error: "We couldn't check that password right now. Try again in a moment." };
    }
  }
  const hash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    // Single use: delete first, and fail if someone else already used it.
    const used = await tx.verification.deleteMany({ where: { id: row.id } });
    if (used.count !== 1) throw new AppError("This invite link was already used.");
    const existing = await tx.account.findFirst({ where: { userId: row.value, providerId: "credential" } });
    if (existing) await tx.account.update({ where: { id: existing.id }, data: { password: hash } });
    else await tx.account.create({ data: { id: randomBytes(12).toString("hex"), accountId: row.value, providerId: "credential", userId: row.value, password: hash } });
    // The invite went to their email, so clicking it verifies the address.
    await tx.user.update({ where: { id: row.value }, data: { emailVerified: true } });
    await revokeSessions(tx, row.value);
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Staff and admin accounts
// ---------------------------------------------------------------------------

export async function createStaffAccount(db: Db, actor: Viewer, input: unknown) {
  requirePermission(actor, "canManageUsers");
  const v = parseOrThrow(staffAccountSchema, input);
  if (v.role === "ADMIN" && actor.role !== "ADMIN") throw new AppError("Only an administrator can create another administrator.", "FORBIDDEN");
  const clash = await db.user.findFirst({ where: { OR: [{ username: v.username }, { gtId: v.gtId }, { email: emailForUsername(v.username) }] } });
  if (clash) throw new FormError(clash.username === v.username ? { username: "An account already exists for this username." } : { gtId: "An account already exists for this GT ID." });
  if (await db.staffProfile.findUnique({ where: { employeeId: v.employeeId } })) throw new FormError({ employeeId: "Another account already uses this employee ID." });

  const perms = permissionsFromInput(actor, v);
  const user = await db.user.create({
    data: {
      id: `u-${randomBytes(8).toString("hex")}`,
      name: displayName(v.firstName, v.lastName, v.preferredName),
      email: emailForUsername(v.username),
      emailVerified: false,
      role: v.role,
      department: v.role === "STAFF" ? (v.department ?? null) : (v.department ?? null),
      isSupervisor: v.isSupervisor,
      username: v.username,
      displayUsername: v.username,
      gtId: v.gtId,
      firstName: v.firstName,
      lastName: v.lastName,
      preferredName: v.preferredName ?? null,
      phone: v.phone ?? null,
      avatarHue: Math.floor(Math.random() * 360),
      staffProfile: {
        create: { employeeId: v.employeeId, title: v.title, officePhone: v.officePhone ?? null, officeLocation: v.officeLocation ?? null, ...perms },
      },
    },
  });
  await writeAudit(db, {
    actorId: actor.id,
    action: "ACCOUNT_CREATED",
    targetType: "User",
    targetId: user.id,
    after: { role: v.role, department: v.department ?? null, isSupervisor: v.isSupervisor, ...perms },
  });
  await sendInvite(db, actor.id, user.id);
  return user;
}

function permissionsFromInput(actor: Viewer, v: { canManageUsers: boolean; canManageContractors: boolean; canVerifyResidence: boolean; canViewAnalytics: boolean; canAssignWork: boolean }) {
  // Only an administrator can hand out permissions; others get the defaults.
  if (actor.role !== "ADMIN") return { canManageUsers: false, canManageContractors: false, canVerifyResidence: false, canViewAnalytics: false, canAssignWork: true };
  return {
    canManageUsers: v.canManageUsers,
    canManageContractors: v.canManageContractors,
    canVerifyResidence: v.canVerifyResidence,
    canViewAnalytics: v.canViewAnalytics,
    canAssignWork: v.canAssignWork,
  };
}

/** Change someone's role, department, supervisor flag, title, or permissions. */
export async function updateStaffAccount(db: Db, actor: Viewer, input: unknown) {
  requirePermission(actor, "canManageUsers");
  const v = parseOrThrow(staffUpdateSchema, input);
  const user = await db.user.findUnique({ where: { id: v.userId }, include: { staffProfile: true } });
  if (!user) throw new AppError("That account doesn't exist.", "NOT_FOUND");
  if (user.id === actor.id && v.role !== user.role) throw new AppError("You can't change your own role.", "FORBIDDEN");
  if ((v.role === "ADMIN" || user.role === "ADMIN") && actor.role !== "ADMIN") throw new AppError("Only an administrator can change an administrator.", "FORBIDDEN");
  if (v.role === "CONTRACTOR" && user.role !== "CONTRACTOR") throw new AppError("Create contractors from the Contractors page.");
  if (v.role === "STUDENT" && user.role !== "STUDENT") throw new AppError("Staff accounts can't become student accounts.");
  if ((v.role === "STAFF" || v.role === "ADMIN") && !user.gtId) throw new AppError("Staff and administrators need a GT ID on file.");

  const before = {
    role: user.role,
    department: user.department,
    isSupervisor: user.isSupervisor,
    ...(user.staffProfile ? pickPerms(user.staffProfile) : {}),
  };
  const perms = permissionsFromInput(actor, v);
  const keepPerms = actor.role === "ADMIN" ? perms : user.staffProfile ? pickPerms(user.staffProfile) : perms;
  const privileged = v.role === "STAFF" || v.role === "ADMIN";

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: v.role, department: privileged ? (v.department ?? null) : user.department, isSupervisor: privileged ? v.isSupervisor : false },
    });
    if (privileged) {
      await tx.staffProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, employeeId: `E-${randomBytes(4).toString("hex")}`, title: v.title || "Staff", ...keepPerms },
        update: { ...(v.title ? { title: v.title } : {}), ...keepPerms },
      });
    }
  });
  const after = { role: v.role, department: privileged ? (v.department ?? null) : user.department, isSupervisor: privileged ? v.isSupervisor : false, ...keepPerms };
  const roleChanged = before.role !== after.role;
  const changed = JSON.stringify(before) !== JSON.stringify({ ...before, ...after });
  if (changed) {
    await writeAudit(db, { actorId: actor.id, action: roleChanged ? "ROLE_CHANGED" : "PERMISSIONS_CHANGED", targetType: "User", targetId: user.id, before, after });
    await revokeSessions(db, user.id);
  }
  return { changed };
}

const pickPerms = (p: { canManageUsers: boolean; canManageContractors: boolean; canVerifyResidence: boolean; canViewAnalytics: boolean; canAssignWork: boolean }) => ({
  canManageUsers: p.canManageUsers,
  canManageContractors: p.canManageContractors,
  canVerifyResidence: p.canVerifyResidence,
  canViewAnalytics: p.canViewAnalytics,
  canAssignWork: p.canAssignWork,
});

export async function setAccountDisabled(db: Db, actor: Viewer, userId: string, disabled: boolean) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("That account doesn't exist.", "NOT_FOUND");
  if (user.role === "CONTRACTOR") requirePermission(actor, "canManageContractors");
  else requirePermission(actor, "canManageUsers");
  if (user.id === actor.id) throw new AppError("You can't disable your own account.", "FORBIDDEN");
  if (user.role === "ADMIN" && actor.role !== "ADMIN") throw new AppError("Only an administrator can disable an administrator.", "FORBIDDEN");
  if (!!user.disabledAt === disabled) return;
  await db.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
  if (disabled) await revokeSessions(db, userId);
  await writeAudit(db, {
    actorId: actor.id,
    action: disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED",
    targetType: "User",
    targetId: userId,
    before: { disabled: !disabled },
    after: { disabled },
  });
}

export async function sendPasswordResetFor(db: Db, actor: Viewer, userId: string, send: (email: string) => Promise<void | { ok: boolean }>): Promise<{ ok: boolean }> {
  requirePermission(actor, "canManageUsers");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("That account doesn't exist.", "NOT_FOUND");
  const sent = await send(user.email);
  const ok = !sent || sent.ok;
  await writeAudit(db, { actorId: actor.id, action: "PASSWORD_RESET_SENT", targetType: "User", targetId: userId });
  return { ok };
}

// ---------------------------------------------------------------------------
// Residence verification (Housing supervisors and admins)
// ---------------------------------------------------------------------------

export async function decideResidence(
  db: Db,
  actor: Viewer,
  input: { userId: string; decision: "verify" | "reject" | "edit"; residenceBuildingId?: string | null; roomId?: string | null },
  now: Date,
) {
  requirePermission(actor, "canVerifyResidence");
  const user = await db.user.findUnique({ where: { id: input.userId }, include: { residenceBuilding: true, room: true } });
  if (!user || user.role !== "STUDENT") throw new AppError("That student doesn't exist.", "NOT_FOUND");
  const before = { residenceBuildingId: user.residenceBuildingId, roomId: user.roomId, residenceVerified: user.residenceVerified };

  let data: Prisma.UserUpdateInput;
  let message: string;
  let action: "RESIDENCE_VERIFIED" | "RESIDENCE_REJECTED" | "RESIDENCE_EDITED";
  if (input.decision === "reject") {
    data = { residenceVerified: false, residenceVerifiedAt: null, residenceVerifiedBy: { disconnect: true }, residenceBuilding: { disconnect: true }, room: { disconnect: true } };
    message = "Housing couldn't confirm the room on your account. Update your residence in Account settings.";
    action = "RESIDENCE_REJECTED";
  } else {
    let hallId = user.residenceBuildingId;
    let roomId = user.roomId;
    if (input.decision === "edit") {
      hallId = input.residenceBuildingId ?? null;
      roomId = input.roomId ?? null;
      if (hallId) {
        const room = roomId ? await db.space.findUnique({ where: { id: roomId } }) : null;
        if (!room || room.buildingId !== hallId || room.scope !== "DORM_ROOM") throw new AppError("Choose a room in that residence hall.");
      }
    }
    if (!hallId || !roomId) throw new AppError("There's no room to verify. Edit the residence first.");
    data = {
      residenceBuilding: { connect: { id: hallId } },
      room: { connect: { id: roomId } },
      residenceVerified: true,
      residenceVerifiedAt: now,
      residenceVerifiedBy: { connect: { id: actor.id } },
    };
    const hall = await db.building.findUnique({ where: { id: hallId } });
    const room = await db.space.findUnique({ where: { id: roomId } });
    message = `Housing confirmed your room: ${hall?.name ?? "your hall"}${room ? `, ${room.label}` : ""}. You can now report and see issues there.`;
    action = input.decision === "edit" ? "RESIDENCE_EDITED" : "RESIDENCE_VERIFIED";
  }
  const updated = await db.user.update({ where: { id: user.id }, data });
  await writeAudit(db, {
    actorId: actor.id,
    action,
    targetType: "User",
    targetId: user.id,
    before,
    after: { residenceBuildingId: updated.residenceBuildingId, roomId: updated.roomId, residenceVerified: updated.residenceVerified },
    at: now,
  });
  await db.notification.create({ data: { userId: user.id, message, tone: input.decision === "reject" ? "warning" : "success", createdAt: now } });
}

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------

function profileData(v: z.output<typeof contractorUpdateSchema> | z.output<typeof contractorCreateSchema>) {
  return {
    companyName: v.companyName,
    companyPhone: v.companyPhone ?? null,
    trades: formatKeyList(v.trades, CATEGORIES),
    departments: formatKeyList(v.departments, DEPARTMENTS),
    licenseNumber: v.licenseNumber ?? null,
    licenseExpiresAt: v.licenseExpiresAt,
    insuranceExpiresAt: v.insuranceExpiresAt,
    backgroundCheckStatus: v.backgroundCheckStatus,
    backgroundCheckedAt: v.backgroundCheckedAt,
    residenceHallAccess: v.residenceHallAccess,
    maxActiveJobs: v.maxActiveJobs,
    hourlyRate: v.hourlyRate,
    contractStartsAt: v.contractStartsAt,
    contractEndsAt: v.contractEndsAt,
    // Scheduling fields: only written when the form sent them.
    ...(v.skills ? { skills: formatKeyList(v.skills, SKILLS) } : {}),
    ...(v.shiftStartMinute !== undefined ? { shiftStartMinute: v.shiftStartMinute } : {}),
    ...(v.shiftEndMinute !== undefined ? { shiftEndMinute: v.shiftEndMinute } : {}),
    ...(v.workDays ? { workDays: [...new Set(v.workDays)].sort().join(",") } : {}),
    ...(v.onCall !== undefined ? { onCall: v.onCall } : {}),
  };
}

export async function createContractor(db: Db, actor: Viewer, input: unknown) {
  requirePermission(actor, "canManageContractors");
  const v = parseOrThrow(contractorCreateSchema, input);
  const clash = await db.user.findFirst({ where: { OR: [{ username: v.username }, { email: v.email }] } });
  if (clash) throw new FormError(clash.username === v.username ? { username: "An account already exists for this username." } : { email: "An account already uses this email." });
  if (await db.contractorProfile.findUnique({ where: { contractorId: v.contractorId } })) throw new FormError({ contractorId: "Another contractor already has this number." });

  const data = profileData(v);
  const user = await db.user.create({
    data: {
      id: `u-${randomBytes(8).toString("hex")}`,
      name: displayName(v.firstName, v.lastName),
      email: v.email,
      role: "CONTRACTOR" satisfies Role,
      username: v.username,
      displayUsername: v.username,
      firstName: v.firstName,
      lastName: v.lastName,
      phone: v.phone ?? null,
      avatarHue: Math.floor(Math.random() * 360),
      contractorProfile: { create: { contractorId: v.contractorId, availability: "OFF_DUTY", ...data } },
    },
  });
  // Pay rates stay out of the audit trail; only admins see them.
  const visible = { ...data, hourlyRate: undefined };
  await writeAudit(db, { actorId: actor.id, action: "CONTRACTOR_CREATED", targetType: "User", targetId: user.id, after: { contractorId: v.contractorId, ...visible } });
  await sendInvite(db, actor.id, user.id);
  return user;
}

export async function updateContractor(db: Db, actor: Viewer, input: unknown) {
  requirePermission(actor, "canManageContractors");
  const v = parseOrThrow(contractorUpdateSchema, input);
  const profile = await db.contractorProfile.findUnique({ where: { userId: v.userId } });
  if (!profile) throw new AppError("That contractor doesn't exist.", "NOT_FOUND");
  const data = profileData(v);
  // Only admins see or set pay rates.
  if (actor.role !== "ADMIN") data.hourlyRate = profile.hourlyRate;
  await db.contractorProfile.update({ where: { userId: v.userId }, data });
  const before = Object.fromEntries(Object.keys(data).map((k) => [k, (profile as Record<string, unknown>)[k]]));
  await writeAudit(db, { actorId: actor.id, action: "CONTRACTOR_UPDATED", targetType: "User", targetId: v.userId, before, after: data });
  // Losing department, trade or access can change what they may see; sign them out.
  if (before.departments !== data.departments || before.residenceHallAccess !== data.residenceHallAccess || before.backgroundCheckStatus !== data.backgroundCheckStatus) {
    await revokeSessions(db, v.userId);
  }
}

/** End the contract today, take them off duty, and sign them out. Open jobs go back to the queue. */
export async function deactivateContractor(db: Db, actor: Viewer, userId: string, now: Date) {
  requirePermission(actor, "canManageContractors");
  const profile = await db.contractorProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError("That contractor doesn't exist.", "NOT_FOUND");
  await db.$transaction(async (tx) => {
    await tx.contractorProfile.update({ where: { userId }, data: { contractEndsAt: now, availability: "OFF_DUTY" } });
    // Their own slots (including helper rows on other people's jobs) go away.
    await tx.scheduledJob.updateMany({ where: { contractorId: userId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
    const open = await tx.ticket.findMany({ where: { assigneeId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS", "REOPENED"] } } });
    // Tickets going back to the queue lose every slot on them (helpers and backups too), by ticket.
    await tx.scheduledJob.updateMany({ where: { ticketId: { in: open.map((t) => t.id) }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
    for (const t of open) {
      await tx.ticket.update({ where: { id: t.id }, data: { assigneeId: null, status: "TRIAGED", updatedAt: now } });
      await tx.ticketEvent.create({ data: { ticketId: t.id, type: "STATUS", fromStatus: t.status, toStatus: "TRIAGED", message: "Back in the queue: the contractor is no longer available", internal: true, createdAt: now } });
    }
    await revokeSessions(tx, userId);
  });
  await writeAudit(db, { actorId: actor.id, action: "CONTRACTOR_DEACTIVATED", targetType: "User", targetId: userId, before: { contractEndsAt: profile.contractEndsAt }, after: { contractEndsAt: now } });
}
