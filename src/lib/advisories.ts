// "Avoid this area" advisories: validation, the active window, posting, clearing,
// and the broadcast notification. Pure helpers first, database functions after.
import * as z from "zod";
import type { Advisory, Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import type { Viewer } from "./visibility";

type Db = PrismaClient | Prisma.TransactionClient;

export const ADVISORY_SEVERITIES = ["EMERGENCY", "WARNING", "INFO"] as const;
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number];
export const ADVISORY_SEVERITY_LABEL: Record<AdvisorySeverity, string> = {
  EMERGENCY: "Emergency",
  WARNING: "Warning",
  INFO: "Notice",
};
export const ADVISORY_LIMITS = { title: 120, message: 1000, area: 160 } as const;
const BROADCAST_CHUNK = 500;

const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.date({ error: "That date isn't valid." }).nullable());

export const advisoryInputSchema = z
  .object({
    title: trimmed(ADVISORY_LIMITS.title, "Title"),
    message: trimmed(ADVISORY_LIMITS.message, "Message"),
    severity: z.enum(ADVISORY_SEVERITIES, { error: "Pick a severity." }),
    buildingId: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(64).nullable()),
    area: z.preprocess(
      (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
      z.string().max(ADVISORY_LIMITS.area, `Area must be ${ADVISORY_LIMITS.area} characters or fewer.`).nullable(),
    ),
    lat: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(-90).max(90).nullable()),
    lng: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(-180).max(180).nullable()),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .refine((v) => (v.lat === null) === (v.lng === null), { message: "Give both latitude and longitude, or neither.", path: ["lat"] })
  .refine((v) => v.buildingId !== null || v.area !== null, { message: "Say where: pick a building or describe the area.", path: ["area"] });

export type AdvisoryInput = z.input<typeof advisoryInputSchema>;
export type ValidAdvisory = Omit<z.output<typeof advisoryInputSchema>, "startsAt"> & { startsAt: Date };

/** Validate untrusted input. startsAt defaults to `now`; endsAt must be after startsAt. Throws AppError(INVALID). */
export function validateAdvisoryInput(raw: unknown, now: Date): ValidAdvisory {
  const parsed = advisoryInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Check the form and try again.", "INVALID");
  const startsAt = parsed.data.startsAt ?? now;
  const { endsAt } = parsed.data;
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new AppError("The end time must be after the start time.", "INVALID");
  return { ...parsed.data, startsAt };
}

type Window = Pick<Advisory, "startsAt" | "endsAt" | "clearedAt">;

/** Not cleared, already started, and not yet ended. */
export function isAdvisoryActive(a: Window, now: Date): boolean {
  const t = now.getTime();
  return !a.clearedAt && a.startsAt.getTime() <= t && (!a.endsAt || a.endsAt.getTime() > t);
}

const SEVERITY_RANK: Record<string, number> = { EMERGENCY: 0, WARNING: 1, INFO: 2 };

/** Most severe first, then newest. */
export function compareAdvisories(a: Pick<Advisory, "severity" | "startsAt">, b: Pick<Advisory, "severity" | "startsAt">): number {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.startsAt.getTime() - a.startsAt.getTime();
}

const withBuilding = { building: { select: { id: true, name: true } } } as const;
export type AdvisoryRow = Prisma.AdvisoryGetPayload<{ include: typeof withBuilding }>;

export async function listActiveAdvisories(db: Db, now: Date): Promise<AdvisoryRow[]> {
  await announceDueAdvisories(db, now);
  const rows = await db.advisory.findMany({
    where: { clearedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    include: withBuilding,
  });
  return rows.sort(compareAdvisories);
}

/** Cleared or expired within the last `days` days (default 14). */
export async function listRecentlyEndedAdvisories(db: Db, now: Date, days = 14): Promise<AdvisoryRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  return db.advisory.findMany({
    where: {
      startsAt: { lte: now },
      OR: [{ clearedAt: { gte: since } }, { clearedAt: null, endsAt: { gte: since, lte: now } }],
    },
    include: withBuilding,
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

/** Advisories scheduled to start later. Staff view only. */
export async function listUpcomingAdvisories(db: Db, now: Date): Promise<AdvisoryRow[]> {
  return db.advisory.findMany({ where: { clearedAt: null, startsAt: { gt: now } }, include: withBuilding, orderBy: { startsAt: "asc" } });
}

export function canPostAdvisory(viewer: Viewer): boolean {
  return viewer.role === "STAFF" || viewer.role === "ADMIN";
}

export function canClearAdvisory(viewer: Viewer, a: Pick<Advisory, "createdById">): boolean {
  return viewer.role === "ADMIN" || (viewer.role === "STAFF" && a.createdById === viewer.id);
}

/**
 * Tell people. Everyone active gets an info/warning notice (danger for emergencies);
 * for a building-specific advisory its residents get the stronger tone. Skips disabled
 * and unverified accounts and contractors whose contract has ended.
 */
export async function notifyAdvisory(db: Db, advisory: Pick<Advisory, "id" | "title" | "severity" | "buildingId" | "createdById">, now: Date): Promise<number> {
  const base = advisory.severity === "EMERGENCY" ? "danger" : advisory.severity === "WARNING" ? "warning" : "info";
  const residentTone = advisory.severity === "INFO" ? "warning" : "danger";
  const prefix = advisory.severity === "EMERGENCY" ? "Avoid this area: " : advisory.severity === "WARNING" ? "Heads up: " : "";
  const message = `${prefix}${advisory.title}`;

  const users = await db.user.findMany({
    where: {
      disabledAt: null,
      emailVerified: true,
      id: { not: advisory.createdById },
      NOT: { role: "CONTRACTOR", contractorProfile: { is: { contractEndsAt: { lt: now } } } },
    },
    select: { id: true, residenceBuildingId: true },
  });
  const data = users.map((u) => ({
    userId: u.id,
    ticketId: null,
    message,
    href: "/advisories",
    tone: advisory.buildingId && u.residenceBuildingId === advisory.buildingId ? residentTone : base,
    createdAt: now,
  }));
  for (let i = 0; i < data.length; i += BROADCAST_CHUNK) {
    await db.notification.createMany({ data: data.slice(i, i + BROADCAST_CHUNK) });
  }
  return data.length;
}

/**
 * Announce every active advisory that hasn't been announced yet (covers ones scheduled for later).
 * The notifiedAt claim is atomic, so only one caller fans out each advisory.
 */
export async function announceDueAdvisories(db: Db, now: Date): Promise<void> {
  const due = await db.advisory.findMany({
    where: { notifiedAt: null, clearedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true, title: true, severity: true, buildingId: true, createdById: true },
  });
  for (const a of due) {
    const claim = await db.advisory.updateMany({ where: { id: a.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claim.count === 1) await notifyAdvisory(db, a, now);
  }
}

export async function createAdvisory(db: PrismaClient, viewer: Viewer, raw: unknown, now: Date): Promise<AdvisoryRow> {
  if (!canPostAdvisory(viewer)) throw new AppError("Only staff and admins can post advisories.", "FORBIDDEN");
  const input = validateAdvisoryInput(raw, now);
  if (input.buildingId) {
    const b = await db.building.findUnique({ where: { id: input.buildingId }, select: { id: true } });
    if (!b) throw new AppError("That building doesn't exist.", "INVALID");
  }
  // Double-submit guard: the same title from the same person in the last minute is the same advisory.
  const dup = await db.advisory.findFirst({
    where: { title: input.title, createdById: viewer.id, createdAt: { gte: new Date(now.getTime() - 60_000) } },
    include: withBuilding,
  });
  if (dup) return dup;
  // Commit the advisory and its audit row first; the fan-out happens outside the transaction.
  const advisory = await db.$transaction(async (tx) => {
    const created = await tx.advisory.create({ data: { ...input, createdById: viewer.id, createdAt: now }, include: withBuilding });
    await writeAudit(tx, { actorId: viewer.id, action: "ADVISORY_POSTED", targetType: "Advisory", targetId: created.id, after: { title: created.title, severity: created.severity, area: created.area, buildingId: created.buildingId }, at: now });
    return created;
  });
  // Not-yet-started advisories are announced later by announceDueAdvisories.
  await announceDueAdvisories(db, now);
  return advisory;
}

export async function clearAdvisory(db: PrismaClient, viewer: Viewer, id: string, now: Date): Promise<void> {
  const a = await db.advisory.findUnique({ where: { id } });
  if (!a) throw new AppError("That advisory doesn't exist.", "NOT_FOUND");
  if (!canClearAdvisory(viewer, a)) throw new AppError("Only an admin or the person who posted it can clear this.", "FORBIDDEN");
  if (a.clearedAt) return;
  await db.$transaction(async (tx) => {
    await tx.advisory.update({ where: { id }, data: { clearedAt: now } });
    await writeAudit(tx, { actorId: viewer.id, action: "ADVISORY_CLEARED", targetType: "Advisory", targetId: id, before: { title: a.title }, at: now });
  });
}
