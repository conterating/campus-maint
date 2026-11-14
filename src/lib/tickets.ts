import type { Prisma, PrismaClient } from "@prisma/client";
import { APP_CONFIG } from "@/config/app";
import { routeTicket } from "@/config/routing";
import {
  CATEGORY_LABEL,
  DEPARTMENT_LABEL,
  OPEN_STATUSES,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  STAFF_SETTABLE_STATUSES,
  STATUS_LABEL,
  isCategory,
  isDepartment,
  isOpenStatus,
  isSeverity,
  locationTypeFor,
  ticketScopeFor,
  type Category,
  type Department,
  type Severity,
  type Status,
} from "./domain";
import { AppError } from "./errors";
import { notifyTicket, supervisorIds } from "./notify";
import { raisedSeverity, responseDueAt, awaitingFirstResponse } from "./sla";
import { textSimilarity } from "./similarity";
import { detectSafetyHazards } from "./triage/safety";
import { canReportAt, canView, isStaff, visibleTickets, type Viewer } from "./visibility";

type Db = PrismaClient;

export function shortName(name: string): string {
  const [first, ...rest] = name.split(" ");
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Load one ticket the viewer is allowed to see, or throw NOT_FOUND. */
export async function getVisibleTicketOrThrow(db: Db, viewer: Viewer, id: string) {
  const ticket = await db.ticket.findFirst({ where: visibleTickets(viewer, { id }) });
  // Hidden and missing tickets are indistinguishable on purpose.
  if (!ticket) throw new AppError("That ticket doesn't exist or isn't visible to you.", "NOT_FOUND");
  return ticket;
}

export async function getTicketDetail(db: Db, viewer: Viewer, id: string) {
  const ticket = await db.ticket.findFirst({
    where: visibleTickets(viewer, { id }),
    include: {
      building: true,
      space: true,
      asset: true,
      reporter: { select: { id: true, name: true } },
      ownerUser: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      events: {
        where: isStaff(viewer) ? {} : { internal: false },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true, role: true, department: true } } },
      },
      _count: { select: { followers: true } },
    },
  });
  if (!ticket) return null;
  const [following, meToo] = await Promise.all([
    db.follow.findUnique({ where: { ticketId_userId: { ticketId: id, userId: viewer.id } } }),
    db.meToo.findUnique({ where: { ticketId_userId: { ticketId: id, userId: viewer.id } } }),
  ]);
  return { ...ticket, viewerFollows: !!following, viewerMeToo: !!meToo };
}

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicketDetail>>>;

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export type CreateTicketInput = {
  buildingId: string;
  spaceId?: string | null;
  assetId?: string | null;
  roomText?: string | null;
  description: string;
  photoUrl?: string | null;
  category: string;
  severity: string;
  summary: string;
  ai: {
    category: string;
    severity: string;
    department: string;
    summary: string;
    source: "claude" | "keywords";
    rationale?: string | null;
  };
};

export async function resolveLocation(db: Db, input: { buildingId: string; spaceId?: string | null; assetId?: string | null }) {
  const building = await db.building.findUnique({ where: { id: input.buildingId } });
  if (!building) throw new AppError("Choose a building from the list.");
  const space = input.spaceId ? await db.space.findUnique({ where: { id: input.spaceId } }) : null;
  if (input.spaceId && (!space || space.buildingId !== building.id)) {
    throw new AppError("That room or area isn't in the selected building.");
  }
  const asset = input.assetId ? await db.asset.findUnique({ where: { id: input.assetId } }) : null;
  if (input.assetId && (!asset || asset.buildingId !== building.id)) {
    throw new AppError("That equipment isn't in the selected building.");
  }
  // Equipment implies its space when the form didn't name one.
  const effectiveSpace = space ?? (asset?.spaceId ? await db.space.findUnique({ where: { id: asset.spaceId } }) : null);
  if (space && asset?.spaceId && asset.spaceId !== space.id) {
    throw new AppError("That equipment isn't in the selected room.");
  }
  return { building, space: effectiveSpace, asset };
}

export function locationLabel(loc: {
  building: { name: string };
  space?: { label: string } | null;
  asset?: { name: string } | null;
  roomText?: string | null;
}): string {
  return [loc.building.name, loc.space?.label ?? loc.roomText ?? null, loc.asset?.name ?? null].filter(Boolean).join(" · ");
}

/** Spread pins in the same building a little so they don't sit exactly on top of each other. */
export function jitter(lat: number, lng: number, seed: number): { lat: number; lng: number } {
  const angle = (seed * 137.508 * Math.PI) / 180; // golden angle
  const r = 0.0001 + (((seed * 7919) % 100) / 100) * 0.00022;
  return { lat: lat + r * Math.sin(angle), lng: lng + r * Math.cos(angle) * 1.2 };
}

export async function createTicket(db: Db, viewer: Viewer, input: CreateTicketInput, now: Date): Promise<{ id: string; number: number }> {
  const description = input.description.trim();
  if (description.length < 8) throw new AppError("Describe the problem in a few more words.");
  if (description.length > 2000) throw new AppError("Keep the description under 2,000 characters.");
  if (!isCategory(input.category)) throw new AppError("Choose a category.");
  if (!isSeverity(input.severity)) throw new AppError("Choose a severity.");

  const { building, space, asset } = await resolveLocation(db, input);
  const permitted = canReportAt(viewer, {
    buildingKind: building.kind,
    buildingId: building.id,
    spaceScope: space?.scope ?? null,
    spaceId: space?.id ?? null,
  });
  if (!permitted.ok) throw new AppError(permitted.reason, "FORBIDDEN");

  const category: Category = input.category;
  const hazards = detectSafetyHazards(description);
  // Safety reports stay Emergency no matter what the form says.
  const severity: Severity = hazards.length > 0 ? "EMERGENCY" : input.severity;
  const locType = locationTypeFor(building.kind, space?.scope);
  const { department } = routeTicket(category, locType);
  const scope = ticketScopeFor(building.kind, space?.scope);
  const studentOwned = scope === "ROOM" && viewer.role === "STUDENT";
  const summary = (input.summary.trim() || input.ai.summary || CATEGORY_LABEL[category]).slice(0, 120);

  return db.$transaction(async (tx) => {
    const last = await tx.ticket.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
    const number = (last?.number ?? 1000) + 1;
    const pos = jitter(building.lat, building.lng, number);

    const ticket = await tx.ticket.create({
      data: {
        number,
        summary,
        description,
        photoUrl: input.photoUrl ?? null,
        category,
        severity,
        department,
        aiCategory: isCategory(input.ai.category) ? input.ai.category : category,
        aiSeverity: isSeverity(input.ai.severity) ? input.ai.severity : severity,
        aiDepartment: isDepartment(input.ai.department) ? input.ai.department : department,
        aiSummary: input.ai.summary || summary,
        aiSource: input.ai.source,
        aiRationale: input.ai.rationale ?? null,
        safetyFlag: hazards.length > 0,
        status: "TRIAGED",
        buildingId: building.id,
        spaceId: space?.id ?? null,
        assetId: asset?.id ?? null,
        floor: space?.floor ?? null,
        roomText: input.roomText?.trim() || null,
        lat: pos.lat,
        lng: pos.lng,
        scope,
        ownerType: studentOwned ? "STUDENT" : "DEPARTMENT",
        ownerUserId: studentOwned ? viewer.id : null,
        reporterId: viewer.id,
        createdAt: now,
        updatedAt: now,
        responseDueAt: responseDueAt(now, severity),
      },
    });

    const corrections: string[] = [];
    if (ticket.aiCategory !== category) corrections.push(`category ${CATEGORY_LABEL[ticket.aiCategory as Category]} → ${CATEGORY_LABEL[category]}`);
    if (ticket.aiSeverity !== severity) corrections.push(`severity ${SEVERITY_LABEL[ticket.aiSeverity as Severity]} → ${SEVERITY_LABEL[severity]}`);

    await tx.ticketEvent.createMany({
      data: [
        { ticketId: ticket.id, type: "STATUS", toStatus: "SUBMITTED", message: viewer.role === "STUDENT" ? "Report submitted by a student" : `Report submitted by ${shortName(viewer.name)}`, actorId: viewer.id, createdAt: now },
        {
          ticketId: ticket.id,
          type: "STATUS",
          fromStatus: "SUBMITTED",
          toStatus: "TRIAGED",
          message:
            `${input.ai.source === "claude" ? "AI triage" : "Auto-triage"}: ${CATEGORY_LABEL[category]} · ${SEVERITY_LABEL[severity]} · routed to ${DEPARTMENT_LABEL[department]}` +
            (corrections.length ? `. Reporter corrected ${corrections.join(", ")}.` : "."),
          createdAt: new Date(now.getTime() + 1000),
        },
      ],
    });

    if (!studentOwned) {
      await tx.follow.create({ data: { ticketId: ticket.id, userId: viewer.id, createdAt: now } });
    }

    if (severity === "EMERGENCY") {
      await notifyTicket(tx, {
        ticket,
        message: `EMERGENCY ${`RR-${number}`}: ${summary} — ${building.name}`,
        tone: "danger",
        actorId: viewer.id,
        now,
        includeWatchers: false,
        includeDepartment: true,
        extraUserIds: await supervisorIds(tx, department),
      });
    } else {
      await notifyTicket(tx, {
        ticket,
        message: `New in your queue: RR-${number} ${summary} (${SEVERITY_LABEL[severity]})`,
        actorId: viewer.id,
        now,
        includeWatchers: false,
        includeDepartment: true,
      });
    }

    return { id: ticket.id, number };
  });
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export type DuplicateMatch = {
  id: string;
  number: number;
  summary: string;
  status: string;
  severity: string;
  category: string;
  meTooCount: number;
  locationLabel: string;
  createdAt: Date;
  score: number;
  reasons: string[];
  reportedByViewer: boolean;
  viewerMeToo: boolean;
};

export async function findDuplicates(
  db: Db,
  viewer: Viewer,
  input: { buildingId: string; spaceId?: string | null; assetId?: string | null; category?: string | null; description: string },
  limit = 3,
): Promise<DuplicateMatch[]> {
  const candidates = await db.ticket.findMany({
    where: visibleTickets(viewer, { buildingId: input.buildingId, status: { in: OPEN_STATUSES } }),
    include: { building: true, space: true, asset: true, meToos: { where: { userId: viewer.id }, select: { userId: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    const sameAsset = !!input.assetId && c.assetId === input.assetId;
    const sameSpace = !!input.spaceId && c.spaceId === input.spaceId;
    const unspecified = !input.spaceId || !c.spaceId;
    const sameCategory = !!input.category && c.category === input.category;
    const sim = textSimilarity(input.description, `${c.summary} ${c.description}`);
    const textMatch = sim >= APP_CONFIG.duplicateTextThreshold;
    const locationMatch = sameAsset || sameSpace || unspecified;

    // Two reports that name different rooms need to agree strongly to count as the same issue.
    const crossRoomMatch = sameCategory && sim >= APP_CONFIG.duplicateCrossRoomThreshold;
    const isMatch = (locationMatch && (sameCategory || textMatch || sameAsset)) || crossRoomMatch;
    if (!isMatch) continue;

    const reasons: string[] = [];
    if (sameAsset) reasons.push("Same equipment");
    else if (sameSpace) reasons.push("Same room or area");
    else reasons.push("Same building");
    if (sameCategory) reasons.push("Same kind of problem");
    if (textMatch) reasons.push("Similar description");

    matches.push({
      id: c.id,
      number: c.number,
      summary: c.summary,
      status: c.status,
      severity: c.severity,
      category: c.category,
      meTooCount: c.meTooCount,
      locationLabel: locationLabel(c),
      createdAt: c.createdAt,
      score: (sameCategory ? 0.4 : 0) + (sameAsset || sameSpace ? 0.3 : 0) + sim,
      reasons,
      reportedByViewer: c.reporterId === viewer.id,
      viewerMeToo: c.meToos.length > 0,
    });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Students: me too, follow, confirm, reopen
// ---------------------------------------------------------------------------

export async function addMeToo(db: Db, viewer: Viewer, ticketId: string, now: Date) {
  if (viewer.role !== "STUDENT") throw new AppError("Only students can add a “me too”.", "FORBIDDEN");
  const ticket = await getVisibleTicketOrThrow(db, viewer, ticketId);
  if (!isOpenStatus(ticket.status)) throw new AppError("This issue is already resolved.", "CONFLICT");
  if (ticket.reporterId === viewer.id) throw new AppError("You reported this issue, so it already counts you.", "CONFLICT");

  return db.$transaction(async (tx) => {
    const existing = await tx.meToo.findUnique({ where: { ticketId_userId: { ticketId, userId: viewer.id } } });
    if (existing) throw new AppError("You've already said “me too” on this issue.", "CONFLICT");

    await tx.meToo.create({ data: { ticketId, userId: viewer.id, createdAt: now } });
    await tx.follow.upsert({
      where: { ticketId_userId: { ticketId, userId: viewer.id } },
      create: { ticketId, userId: viewer.id, createdAt: now },
      update: {},
    });
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { meTooCount: { increment: 1 }, updatedAt: now } });
    const count = updated.meTooCount;

    await tx.ticketEvent.create({
      data: { ticketId, type: "METOO", message: `Another student has this problem too (${count + 1} people affected)`, actorId: viewer.id, createdAt: now },
    });

    let raisedTo: Severity | null = null;
    const current = updated.severity as Severity;
    if (count === APP_CONFIG.meTooPriorityThreshold && raisedSeverity(current) !== current) {
      raisedTo = raisedSeverity(current);
      const dueAt = awaitingFirstResponse(updated) ? responseDueAt(updated.createdAt, raisedTo) : updated.responseDueAt;
      await tx.ticket.update({ where: { id: ticketId }, data: { severity: raisedTo, responseDueAt: dueAt, updatedAt: now } });
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "PRIORITY",
          message: `Priority raised from ${SEVERITY_LABEL[current]} to ${SEVERITY_LABEL[raisedTo]}: ${count} students said “me too”`,
          createdAt: new Date(now.getTime() + 1000),
        },
      });
      await notifyTicket(tx, {
        ticket: updated,
        message: `RR-${updated.number} raised to ${SEVERITY_LABEL[raisedTo]} after ${count} “me too” reports`,
        tone: "warning",
        actorId: viewer.id,
        now,
        includeDepartment: true,
      });
    } else {
      await notifyTicket(tx, {
        ticket: updated,
        message: `Another student reported RR-${updated.number} (${count} “me too”)`,
        actorId: viewer.id,
        now,
        includeWatchers: false,
        includeDepartment: true,
      });
    }
    return { meTooCount: count, raisedTo };
  });
}

export async function setFollow(db: Db, viewer: Viewer, ticketId: string, follow: boolean, now: Date) {
  const ticket = await getVisibleTicketOrThrow(db, viewer, ticketId);
  if (!follow && ticket.ownerUserId === viewer.id) {
    throw new AppError("You own this ticket, so you'll always get its updates.", "CONFLICT");
  }
  const key = { ticketId_userId: { ticketId, userId: viewer.id } };
  if (follow) {
    await db.follow.upsert({ where: key, create: { ticketId, userId: viewer.id, createdAt: now }, update: {} });
  } else {
    await db.follow.deleteMany({ where: { ticketId, userId: viewer.id } });
  }
  return { following: follow };
}

function canCloseOut(viewer: Viewer, t: { ownerUserId: string | null; reporterId: string }) {
  return viewer.role === "STUDENT" && (t.ownerUserId === viewer.id || t.reporterId === viewer.id);
}

export async function confirmResolution(db: Db, viewer: Viewer, ticketId: string, now: Date) {
  const ticket = await getVisibleTicketOrThrow(db, viewer, ticketId);
  if (!canCloseOut(viewer, ticket)) throw new AppError("Only the student who reported this can confirm the fix.", "FORBIDDEN");
  if (ticket.status !== "RESOLVED") throw new AppError("You can confirm once staff mark this resolved.", "CONFLICT");
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "CONFIRMED", closedAt: now, updatedAt: now } });
    await tx.ticketEvent.create({
      data: { ticketId, type: "STATUS", fromStatus: "RESOLVED", toStatus: "CONFIRMED", message: "The reporter confirmed the fix", actorId: viewer.id, createdAt: now },
    });
    await notifyTicket(tx, { ticket: updated, message: `RR-${updated.number} confirmed fixed by the reporter`, tone: "success", actorId: viewer.id, now, includeDepartment: true });
    return updated;
  });
}

export async function reopenTicket(db: Db, viewer: Viewer, ticketId: string, reason: string, now: Date) {
  const ticket = await getVisibleTicketOrThrow(db, viewer, ticketId);
  if (!canCloseOut(viewer, ticket)) throw new AppError("Only the student who reported this can reopen it.", "FORBIDDEN");
  if (ticket.status !== "RESOLVED" && ticket.status !== "CONFIRMED") {
    throw new AppError("Only resolved issues can be reopened.", "CONFLICT");
  }
  const why = reason.trim();
  if (why.length < 3) throw new AppError("Tell staff what's still wrong so they can fix it.");
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: "REOPENED",
        resolvedAt: null,
        closedAt: null,
        firstResponseAt: null,
        escalatedAt: null,
        responseDueAt: responseDueAt(now, ticket.severity as Severity),
        updatedAt: now,
      },
    });
    await tx.ticketEvent.create({
      data: { ticketId, type: "STATUS", fromStatus: ticket.status, toStatus: "REOPENED", message: `The reporter reopened it: “${why.slice(0, 300)}”`, actorId: viewer.id, createdAt: now },
    });
    await notifyTicket(tx, { ticket: updated, message: `RR-${updated.number} was reopened: ${why.slice(0, 80)}`, tone: "warning", actorId: viewer.id, now, includeDepartment: true });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

async function staffTicketOrThrow(db: Db, viewer: Viewer, ticketId: string) {
  if (!isStaff(viewer)) throw new AppError("Only staff can do that.", "FORBIDDEN");
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("That ticket doesn't exist.", "NOT_FOUND");
  if (viewer.role === "STAFF" && ticket.department !== viewer.department) {
    throw new AppError(`This ticket belongs to ${DEPARTMENT_LABEL[ticket.department as Department]}. Ask them to reassign it.`, "FORBIDDEN");
  }
  return ticket;
}

const RESPONSE_STATUSES: Status[] = ["ASSIGNED", "IN_PROGRESS", "RESOLVED"];

export async function staffSetStatus(
  db: Db,
  viewer: Viewer,
  ticketId: string,
  input: { status: string; assigneeId?: string | null; note?: string | null },
  now: Date,
) {
  const ticket = await staffTicketOrThrow(db, viewer, ticketId);
  const status = input.status as Status;
  if (!STAFF_SETTABLE_STATUSES.includes(status)) throw new AppError("Choose a valid status.");
  if (ticket.status === "CONFIRMED") throw new AppError("The reporter confirmed this fix. They can reopen it if needed.", "CONFLICT");

  let assigneeId = ticket.assigneeId;
  let assigneeName: string | null = null;
  if (status === "ASSIGNED" || input.assigneeId) {
    const target = input.assigneeId ?? viewer.id;
    const assignee = await db.user.findUnique({ where: { id: target } });
    if (!assignee || assignee.role === "STUDENT") throw new AppError("Assign the ticket to a staff member.");
    if (assignee.role === "STAFF" && assignee.department !== ticket.department) {
      throw new AppError("Assign it to someone in the ticket's department, or reassign the department first.");
    }
    assigneeId = assignee.id;
    assigneeName = shortName(assignee.name);
  }
  if (status === ticket.status && assigneeId === ticket.assigneeId) {
    throw new AppError(`It's already ${STATUS_LABEL[status].toLowerCase()}.`, "CONFLICT");
  }

  const isResponse = RESPONSE_STATUSES.includes(status);
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        assigneeId,
        firstResponseAt: ticket.firstResponseAt ?? (isResponse ? now : null),
        resolvedAt: status === "RESOLVED" ? now : null,
        updatedAt: now,
      },
    });
    const note = input.note?.trim();
    const label = STATUS_LABEL[status];
    const message =
      (status === "ASSIGNED" && assigneeName ? `Assigned to ${assigneeName}` : `${label}`) + (note ? ` — ${note.slice(0, 500)}` : "");
    await tx.ticketEvent.create({
      data: { ticketId, type: "STATUS", fromStatus: ticket.status, toStatus: status, message, actorId: viewer.id, createdAt: now },
    });
    await notifyTicket(tx, {
      ticket: updated,
      message:
        status === "RESOLVED"
          ? `RR-${updated.number} is resolved. Check it and confirm, or reopen it.`
          : `RR-${updated.number} is now ${label.toLowerCase()}${assigneeName && status === "ASSIGNED" ? ` (${assigneeName})` : ""}`,
      tone: status === "RESOLVED" ? "success" : "info",
      actorId: viewer.id,
      now,
      extraUserIds: assigneeId && assigneeId !== ticket.assigneeId ? [assigneeId] : [],
    });
    return updated;
  });
}

export async function staffReassign(db: Db, viewer: Viewer, ticketId: string, department: string, reason: string | null, now: Date) {
  const ticket = await staffTicketOrThrow(db, viewer, ticketId);
  if (!isDepartment(department)) throw new AppError("Choose a department.");
  if (department === ticket.department) throw new AppError("It's already with that department.", "CONFLICT");
  const from = DEPARTMENT_LABEL[ticket.department as Department];
  const to = DEPARTMENT_LABEL[department];
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { department, assigneeId: null, status: isOpenStatus(ticket.status) ? "TRIAGED" : ticket.status, updatedAt: now },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId,
        type: "REASSIGN",
        fromStatus: ticket.status,
        toStatus: updated.status,
        message: `Moved from ${from} to ${to}${reason?.trim() ? ` — ${reason.trim().slice(0, 300)}` : ""}`,
        actorId: viewer.id,
        createdAt: now,
      },
    });
    await notifyTicket(tx, { ticket: updated, message: `RR-${updated.number} moved to ${to}`, actorId: viewer.id, now, includeDepartment: true });
    return updated;
  });
}

export async function staffOverride(
  db: Db,
  viewer: Viewer,
  ticketId: string,
  input: { category?: string | null; severity?: string | null; summary?: string | null; reason?: string | null },
  now: Date,
) {
  const ticket = await staffTicketOrThrow(db, viewer, ticketId);
  const category = input.category || ticket.category;
  const severity = input.severity || ticket.severity;
  const summary = input.summary?.trim() || ticket.summary;
  if (!isCategory(category)) throw new AppError("Choose a category.");
  if (!isSeverity(severity)) throw new AppError("Choose a severity.");

  const changes: string[] = [];
  if (category !== ticket.category) changes.push(`category ${CATEGORY_LABEL[ticket.category as Category]} → ${CATEGORY_LABEL[category]}`);
  if (severity !== ticket.severity) changes.push(`severity ${SEVERITY_LABEL[ticket.severity as Severity]} → ${SEVERITY_LABEL[severity]}`);
  if (summary !== ticket.summary) changes.push("summary updated");
  if (!changes.length) throw new AppError("Nothing changed.", "CONFLICT");

  const dueAt =
    severity !== ticket.severity && awaitingFirstResponse(ticket) ? responseDueAt(ticket.createdAt, severity) : ticket.responseDueAt;

  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { category, severity, summary: summary.slice(0, 120), responseDueAt: dueAt, safetyFlag: severity === "EMERGENCY" ? ticket.safetyFlag : false, updatedAt: now },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId,
        type: "OVERRIDE",
        message: `Staff changed ${changes.join(", ")}${input.reason?.trim() ? ` — ${input.reason.trim().slice(0, 300)}` : ""}`,
        actorId: viewer.id,
        createdAt: now,
      },
    });
    await notifyTicket(tx, { ticket: updated, message: `RR-${updated.number}: staff changed ${changes.join(", ")}`, actorId: viewer.id, now });
    return updated;
  });
}

export async function staffAddNote(db: Db, viewer: Viewer, ticketId: string, text: string, internal: boolean, now: Date) {
  const ticket = await staffTicketOrThrow(db, viewer, ticketId);
  const message = text.trim();
  if (message.length < 2) throw new AppError("Write a note first.");
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      // A note the student can read counts as a first response.
      data: { firstResponseAt: ticket.firstResponseAt ?? (internal ? null : now), updatedAt: now },
    });
    await tx.ticketEvent.create({ data: { ticketId, type: "NOTE", message: message.slice(0, 1000), internal, actorId: viewer.id, createdAt: now } });
    if (!internal) {
      await notifyTicket(tx, { ticket: updated, message: `Update on RR-${updated.number}: ${message.slice(0, 90)}`, actorId: viewer.id, now });
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/**
 * Escalate every open ticket that passed its first-response target without a
 * response. Idempotent: a ticket is escalated at most once per response window.
 */
export async function runEscalationSweep(db: Db, now: Date): Promise<number> {
  const overdue = await db.ticket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      firstResponseAt: null,
      escalatedAt: null,
      responseDueAt: { lt: now },
    },
  });
  for (const t of overdue) {
    await db.$transaction(async (tx) => {
      // Re-check inside the transaction so concurrent sweeps don't double-escalate.
      const claimed = await tx.ticket.updateMany({ where: { id: t.id, escalatedAt: null }, data: { escalatedAt: now, updatedAt: now } });
      if (claimed.count === 0) return;
      const sups = await tx.user.findMany({ where: { role: "STAFF", department: t.department, isSupervisor: true }, select: { id: true, name: true } });
      const dept = DEPARTMENT_LABEL[t.department as Department];
      const target = APP_CONFIG.responseTargetHours[t.severity as Severity];
      await tx.ticketEvent.create({
        data: {
          ticketId: t.id,
          type: "ESCALATED",
          message: `No response within the ${target}-hour target. Escalated to the ${dept} supervisor${sups[0] ? ` (${shortName(sups[0].name)})` : ""}.`,
          createdAt: now,
        },
      });
      await notifyTicket(tx, {
        ticket: t,
        message: `Overdue: RR-${t.number} ${t.summary} missed its ${target}h response target`,
        tone: "danger",
        now,
        includeWatchers: false,
        includeDepartment: true,
        extraUserIds: sups.map((s) => s.id),
      });
      await notifyTicket(tx, {
        ticket: t,
        message: `RR-${t.number} is overdue and was escalated to the ${dept} supervisor`,
        tone: "warning",
        now,
      });
    });
  }
  return overdue.length;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const listInclude = {
  building: { select: { id: true, name: true, code: true, kind: true } },
  space: { select: { id: true, label: true } },
  asset: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

export async function listMyTickets(db: Db, viewer: Viewer) {
  return db.ticket.findMany({
    where: visibleTickets(viewer, {
      OR: [{ reporterId: viewer.id }, { ownerUserId: viewer.id }, { followers: { some: { userId: viewer.id } } }],
    }),
    include: listInclude,
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function listVisibleTickets(db: Db, viewer: Viewer, where: Prisma.TicketWhereInput = {}) {
  return db.ticket.findMany({ where: visibleTickets(viewer, where), include: listInclude, orderBy: { createdAt: "desc" } });
}

export async function listDepartmentQueue(db: Db, department: string) {
  return db.ticket.findMany({
    where: { department },
    include: { ...listInclude, assignee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type ListTicket = Awaited<ReturnType<typeof listVisibleTickets>>[number];

export function severityRank(s: string): number {
  return SEVERITY_RANK[s as Severity] ?? 0;
}

export { canView };
