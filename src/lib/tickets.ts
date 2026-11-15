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
  MAX_COMMENT_LENGTH,
  MAX_COMMENT_PHOTOS,
  PHOTO_URL_PATTERN,
  formatTicketNumber,
  isCategory,
  isDepartment,
  isOpenStatus,
  isSeverity,
  isSkill,
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
import { can, canReportAt, canView, isStaff, visibleTickets, type Viewer } from "./visibility";
import { assignmentProblems } from "./eligibility";
import { formatClock } from "./scheduling/time";
import { autoAssignTicket, suggestAssignees, cancelScheduledJobs, completeScheduledJobs, markJobStarted, replanAfterChange, scheduleManualAssignment } from "./scheduling/service";
import { deriveRequiredSkills, estimateMinutes } from "./scheduling/skills";

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
      reporter: { select: { id: true, name: true, firstName: true, preferredName: true } },
      ownerUser: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, role: true } },
      workLogs: { orderBy: { startedAt: "asc" }, include: { contractor: { select: { id: true, name: true } } } },
      events: {
        // Staff see everything. The assigned contractor needs the full picture; a helper (or anyone else) doesn't see internal notes.
        where: isStaff(viewer) ? {} : viewer.role === "CONTRACTOR" ? { OR: [{ internal: false }, { ticket: { assigneeId: viewer.id } }] } : { internal: false },
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
    /** Skill keys and minutes from the AI triage, when it provided them. */
    requiredSkills?: string[];
    estimatedMinutes?: number | null;
  };
};

/** Don't dispatch automatically (seeding replays dispatch by hand). Also off when AUTO_ASSIGN=off. */
export type CreateTicketOptions = { autoAssign?: boolean };

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

export async function createTicket(db: Db, viewer: Viewer, input: CreateTicketInput, now: Date, opts: CreateTicketOptions = {}): Promise<{ id: string; number: number }> {
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

  // Skills the AI named, merged with what the category and description imply.
  // If the reporter changed the category, the AI's skills and estimate were for another job: use the final category.
  const aiAgrees = input.ai.category === category;
  const requiredSkills = [...new Set([...(aiAgrees ? (input.ai.requiredSkills ?? []).filter(isSkill) : []), ...deriveRequiredSkills(category, description)])].slice(0, 4);
  const estimatedMinutes = Math.min(480, Math.max(15, Math.round((aiAgrees ? input.ai.estimatedMinutes : null) ?? estimateMinutes(category, requiredSkills))));

  const created = await db.$transaction(async (tx) => {
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
        requiredSkills: requiredSkills.join(","),
        estimatedMinutes,
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

  // Dispatch once the report is safely saved. A scheduler failure must never block filing.
  if (opts.autoAssign ?? process.env.AUTO_ASSIGN !== "off") {
    try {
      await autoAssignTicket(db, created.id, now);
    } catch (err) {
      console.error("Auto-assign failed", err);
    }
  }
  return created;
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
  const reopened = await db.$transaction(async (tx) => {
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
  // A contractor assignee gets it back on their calendar (best effort).
  if (reopened.assigneeId) {
    try {
      await scheduleManualAssignment(db, ticketId, reopened.assigneeId, now);
    } catch (err) {
      console.error("Schedule sync failed", err);
    }
  }
  return reopened;
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

/** Count open tickets assigned to someone, optionally ignoring one ticket. */
export async function activeJobCount(db: Db | Prisma.TransactionClient, userId: string, exceptTicketId?: string) {
  return db.ticket.count({
    where: { assigneeId: userId, status: { in: OPEN_STATUSES }, ...(exceptTicketId ? { id: { not: exceptTicketId } } : {}) },
  });
}

/**
 * Who may be assigned this ticket: an eligible CONTRACTOR (department, trade,
 * credentials, hall access, availability, capacity), or a STAFF member of the
 * ticket's department. Throws with every reason when the person isn't eligible.
 */
export async function assertAssignable(
  db: Db,
  ticket: { id: string; department: string; category: string; scope: string },
  userId: string,
  now: Date,
) {
  const assignee = await db.user.findUnique({ where: { id: userId }, include: { contractorProfile: true } });
  if (!assignee || assignee.disabledAt) throw new AppError("Assign the ticket to an active contractor or staff member.");
  if (assignee.role === "STAFF") {
    if (assignee.department !== ticket.department) {
      throw new AppError("Assign it to someone in the ticket's department, or reassign the department first.");
    }
    return assignee;
  }
  if (assignee.role !== "CONTRACTOR" || !assignee.contractorProfile) {
    throw new AppError("Assign the ticket to an eligible contractor or to staff in its department.");
  }
  const p = assignee.contractorProfile;
  const problems = assignmentProblems(
    { ...p, userId: assignee.id, role: assignee.role, disabledAt: assignee.disabledAt },
    ticket,
    await activeJobCount(db, assignee.id, ticket.id),
    now,
  );
  if (problems.length) throw new AppError(`${shortName(assignee.name)} can't take this job: ${problems.join("; ")}.`);
  return assignee;
}

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
  let assigneeRole: string | null = null;
  if (status === "ASSIGNED" || input.assigneeId) {
    const target = input.assigneeId ?? (viewer.role === "STAFF" ? viewer.id : null);
    if (!target) throw new AppError("Choose a contractor or staff member to assign.");
    if (target !== ticket.assigneeId || status === "ASSIGNED") {
      if (target !== ticket.assigneeId && !can(viewer, "canAssignWork")) throw new AppError("You don't have permission to assign work.", "FORBIDDEN");
      const assignee = target === ticket.assigneeId ? await db.user.findUniqueOrThrow({ where: { id: target } }) : await assertAssignable(db, ticket, target, now);
      assigneeId = assignee.id;
      assigneeName = shortName(assignee.name);
      assigneeRole = assignee.role;
    }
  }
  if (status === ticket.status && assigneeId === ticket.assigneeId) {
    throw new AppError(`It's already ${STATUS_LABEL[status].toLowerCase()}.`, "CONFLICT");
  }

  const isResponse = RESPONSE_STATUSES.includes(status);
  const result = await db.$transaction(async (tx) => {
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
    const newAssignee = assigneeId && assigneeId !== ticket.assigneeId;
    await notifyTicket(tx, {
      ticket: updated,
      message:
        status === "RESOLVED"
          ? `RR-${updated.number} is resolved. Check it and confirm, or reopen it.`
          : status === "ASSIGNED" && assigneeRole === "CONTRACTOR" && assigneeName
            ? `A contractor (${assigneeName}) is assigned to RR-${updated.number}`
            : status === "IN_PROGRESS"
              ? `Work has started on RR-${updated.number}`
              : `RR-${updated.number} is now ${label.toLowerCase()}${assigneeName && status === "ASSIGNED" ? ` (${assigneeName})` : ""}`,
      tone: status === "RESOLVED" ? "success" : "info",
      actorId: viewer.id,
      now,
    });
    if (newAssignee) {
      // Tell the new assignee about the job (the generic message above is for the student).
      await notifyTicket(tx, {
        ticket: updated,
        message: `New job: RR-${updated.number} ${updated.summary}`,
        actorId: viewer.id,
        now,
        includeWatchers: false,
        extraUserIds: [assigneeId!],
      });
    }
    return updated;
  });
  // Keep the contractor's calendar in step (best effort: the status change already committed).
  try {
    if (assigneeId !== ticket.assigneeId) {
      await cancelScheduledJobs(db, ticketId);
      if (assigneeId && assigneeRole === "CONTRACTOR") await scheduleManualAssignment(db, ticketId, assigneeId, now);
    }
    if (status === "RESOLVED" && assigneeId) await completeScheduledJobs(db, ticketId, assigneeId, now);
  } catch (err) {
    console.error("Schedule sync failed", err);
  }
  return result;
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
    await cancelScheduledJobs(tx, ticketId);
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

  // A different category is a different job: its skills and time estimate follow.
  const categoryChanged = category !== ticket.category;
  const skills = categoryChanged ? deriveRequiredSkills(category, ticket.description) : null;
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        category,
        severity,
        summary: summary.slice(0, 120),
        responseDueAt: dueAt,
        safetyFlag: severity === "EMERGENCY" ? ticket.safetyFlag : false,
        updatedAt: now,
        ...(skills ? { requiredSkills: skills.join(","), estimatedMinutes: estimateMinutes(category, skills) } : {}),
      },
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
  if (categoryChanged || severity !== ticket.severity) {
    try {
      await replanAfterChange(db, ticketId, now);
    } catch (err) {
      console.error("Schedule sync failed", err);
    }
  }
  return result;
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
// Comments
// ---------------------------------------------------------------------------

export type CommentInput = { text: string; photoUrls?: string[] };

/**
 * Anyone who can see a ticket can comment on it, with up to MAX_COMMENT_PHOTOS
 * photos. Comments are public to everyone who can see the ticket; staff who
 * need a private note use staffAddNote(..., internal = true) instead.
 *
 * - A student who comments starts following the ticket, so they see replies.
 * - A comment from the owning department (or an administrator) counts as the
 *   first response, exactly like a public staff note.
 * - Everyone watching is notified, and so is the department when the comment
 *   comes from outside it. The commenter is never notified.
 */
export async function addComment(db: Db, viewer: Viewer, ticketId: string, input: CommentInput, now: Date): Promise<{ id: string }> {
  const ticket = await getVisibleTicketOrThrow(db, viewer, ticketId);
  const text = input.text.trim();
  const photos = input.photoUrls ?? [];
  if (!text && photos.length === 0) throw new AppError("Write a comment or add a photo first.");
  if (text.length > MAX_COMMENT_LENGTH) throw new AppError(`Keep comments under ${MAX_COMMENT_LENGTH.toLocaleString("en-US")} characters.`);
  if (photos.length > MAX_COMMENT_PHOTOS) throw new AppError(`Add up to ${MAX_COMMENT_PHOTOS} photos per comment.`);
  if (!photos.every((u) => PHOTO_URL_PATTERN.test(u))) throw new AppError("One of those photos didn't upload correctly. Try adding it again.");

  const fromDepartment = isStaff(viewer) && (viewer.role === "ADMIN" || viewer.department === ticket.department);

  return db.$transaction(async (tx) => {
    const event = await tx.ticketEvent.create({
      data: { ticketId, type: "COMMENT", message: text, photos: photos.length ? JSON.stringify(photos) : null, actorId: viewer.id, createdAt: now },
    });
    const updated =
      fromDepartment && !ticket.firstResponseAt ? await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now } }) : ticket;
    if (!isStaff(viewer)) {
      await tx.follow.upsert({
        where: { ticketId_userId: { ticketId, userId: viewer.id } },
        create: { ticketId, userId: viewer.id, createdAt: now },
        update: {},
      });
    }
    const photoNote = photos.length === 1 ? " (with a photo)" : photos.length > 1 ? ` (with ${photos.length} photos)` : "";
    const preview = text ? `: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}` : "";
    await notifyTicket(tx, {
      ticket: updated,
      message: `New comment on ${formatTicketNumber(updated.number)}${photoNote}${preview}`,
      actorId: viewer.id,
      now,
      includeDepartment: !fromDepartment,
    });
    return { id: event.id };
  });
}

// ---------------------------------------------------------------------------
// Contractors: only on tickets assigned to them
// ---------------------------------------------------------------------------

async function contractorTicketOrThrow(db: Db, viewer: Viewer, ticketId: string) {
  if (viewer.role !== "CONTRACTOR") throw new AppError("Only the assigned contractor can do that.", "FORBIDDEN");
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  // Tickets that aren't theirs look the same as missing ones.
  if (!ticket || ticket.assigneeId !== viewer.id) throw new AppError("That ticket doesn't exist or isn't assigned to you.", "NOT_FOUND");
  if (ticket.status === "CONFIRMED") throw new AppError("The reporter already confirmed this fix.", "CONFLICT");
  return ticket;
}

/** Start work: opens a WorkLog, sets In progress, and records entering the room for ROOM tickets. */
export async function contractorStartWork(db: Db, viewer: Viewer, ticketId: string, note: string | null, now: Date) {
  const ticket = await contractorTicketOrThrow(db, viewer, ticketId);
  if (!isOpenStatus(ticket.status)) throw new AppError("This job is already resolved. Ask the dispatcher to reopen it.", "CONFLICT");
  const open = await db.workLog.findFirst({ where: { ticketId, contractorId: viewer.id, endedAt: null } });
  if (open) throw new AppError("You've already started work on this job. Finish it first.", "CONFLICT");
  const text = note?.trim();
  const log = await db.$transaction(async (tx) => {
    const log = await tx.workLog.create({
      data: { ticketId, contractorId: viewer.id, startedAt: now, roomEnteredAt: ticket.scope === "ROOM" ? now : null, createdAt: now },
    });
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { status: "IN_PROGRESS", firstResponseAt: ticket.firstResponseAt ?? now, resolvedAt: null, updatedAt: now },
    });
    await tx.contractorProfile.updateMany({ where: { userId: viewer.id }, data: { availability: "ON_JOB" } });
    if (ticket.status !== "IN_PROGRESS") {
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "STATUS",
          fromStatus: ticket.status,
          toStatus: "IN_PROGRESS",
          message: `Work started${text ? ` — ${text.slice(0, 500)}` : ""}`,
          actorId: viewer.id,
          createdAt: now,
        },
      });
    }
    await notifyTicket(tx, { ticket: updated, message: `Work has started on RR-${updated.number}`, actorId: viewer.id, now, includeDepartment: false });
    return log;
  });
  try {
    await markJobStarted(db, ticketId, viewer.id, now);
  } catch (err) {
    console.error("Schedule sync failed", err);
  }
  return log;
}

export type FinishWorkInput = {
  materials?: string | null;
  materialsCost?: number | null;
  notes?: string | null;
  completionPhotoUrl?: string | null;
};

/** Finish: closes the open WorkLog (time, materials, cost, notes, photo) and marks the ticket Resolved. */
export async function contractorFinishWork(db: Db, viewer: Viewer, ticketId: string, input: FinishWorkInput, now: Date) {
  const ticket = await contractorTicketOrThrow(db, viewer, ticketId);
  const open = await db.workLog.findFirst({ where: { ticketId, contractorId: viewer.id, endedAt: null }, orderBy: { startedAt: "desc" } });
  if (!open) throw new AppError("Start work on this job before finishing it.", "CONFLICT");
  const profile = await db.contractorProfile.findUnique({ where: { userId: viewer.id } });
  const minutes = Math.max(1, Math.round((now.getTime() - open.startedAt.getTime()) / 60_000));
  const laborCost = profile?.hourlyRate != null ? Math.round(((profile.hourlyRate * minutes) / 60) * 100) / 100 : null;
  const notes = input.notes?.trim() || null;
  const finished = await db.$transaction(async (tx) => {
    await tx.workLog.update({
      where: { id: open.id },
      data: {
        endedAt: now,
        minutes,
        roomExitedAt: open.roomEnteredAt ? now : null,
        materials: input.materials?.trim() || null,
        materialsCost: input.materialsCost ?? null,
        laborCost,
        notes,
        completionPhotoUrl: input.completionPhotoUrl ?? null,
      },
    });
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: now, firstResponseAt: ticket.firstResponseAt ?? now, updatedAt: now },
    });
    const stillWorking = await tx.workLog.count({ where: { contractorId: viewer.id, endedAt: null } });
    if (!stillWorking) await tx.contractorProfile.updateMany({ where: { userId: viewer.id, availability: "ON_JOB" }, data: { availability: "AVAILABLE" } });
    await tx.ticketEvent.create({
      data: {
        ticketId,
        type: "STATUS",
        fromStatus: ticket.status,
        toStatus: "RESOLVED",
        message: `Resolved${notes ? ` — ${notes.slice(0, 500)}` : ""}`,
        actorId: viewer.id,
        createdAt: now,
      },
    });
    await notifyTicket(tx, {
      ticket: updated,
      message: `RR-${updated.number} is resolved. Check it and confirm, or reopen it.`,
      tone: "success",
      actorId: viewer.id,
      now,
      extraUserIds: await supervisorIds(tx, updated.department),
    });
    return updated;
  });
  try {
    await completeScheduledJobs(db, ticketId, viewer.id, now);
  } catch (err) {
    console.error("Schedule sync failed", err);
  }
  return finished;
}

/** Contractors may move their own jobs to In progress or Resolved (without the work log, e.g. a quick fix). */
export async function contractorSetStatus(db: Db, viewer: Viewer, ticketId: string, status: string, note: string | null, now: Date) {
  if (status === "IN_PROGRESS") return contractorStartWork(db, viewer, ticketId, note, now);
  if (status === "RESOLVED") return contractorFinishWork(db, viewer, ticketId, { notes: note }, now);
  throw new AppError("Contractors can set a job to In progress or Resolved.", "FORBIDDEN");
}

/** Public note from the contractor (students see it). Contractors can't write internal notes. */
export async function contractorAddNote(db: Db, viewer: Viewer, ticketId: string, text: string, now: Date) {
  const ticket = await contractorTicketOrThrow(db, viewer, ticketId);
  const message = text.trim();
  if (message.length < 2) throw new AppError("Write a note first.");
  return db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: ticket.firstResponseAt ?? now, updatedAt: now } });
    await tx.ticketEvent.create({ data: { ticketId, type: "NOTE", message: message.slice(0, 1000), internal: false, actorId: viewer.id, createdAt: now } });
    await notifyTicket(tx, { ticket: updated, message: `Update on RR-${updated.number}: ${message.slice(0, 90)}`, actorId: viewer.id, now });
    return updated;
  });
}

export async function contractorSetAvailability(db: Db, viewer: Viewer, availability: string) {
  if (viewer.role !== "CONTRACTOR") throw new AppError("Only contractors set availability.", "FORBIDDEN");
  if (availability === "ON_BREAK") throw new AppError("Use Start break to go on a break.");
  if (!["AVAILABLE", "ON_JOB", "OFF_DUTY"].includes(availability)) throw new AppError("Choose your availability.");
  await db.contractorProfile.update({ where: { userId: viewer.id }, data: { availability } });
}

/** A contractor's jobs: open first (queue order is applied by the page), then recently resolved. */
export async function listContractorJobs(db: Db, viewer: Viewer) {
  if (viewer.role !== "CONTRACTOR") return [];
  return db.ticket.findMany({
    where: { assigneeId: viewer.id },
    include: { ...listInclude, workLogs: { where: { contractorId: viewer.id }, orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * People a dispatcher can assign this ticket to: contractors for the department
 * (with eligibility problems, so the form can explain why someone is greyed
 * out) and the department's staff.
 */
export async function assignmentOptions(db: Db, ticket: { id: string; department: string; category: string; scope: string; requiredSkills?: string | null }, now: Date) {
  const [contractors, staff] = await Promise.all([
    db.user.findMany({
      where: { role: "CONTRACTOR", contractorProfile: { departments: { contains: ticket.department } } },
      include: { contractorProfile: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { role: "STAFF", department: ticket.department, disabledAt: null }, orderBy: { name: "asc" } }),
  ]);
  const counts = await db.ticket.groupBy({
    by: ["assigneeId"],
    where: { assigneeId: { in: [...contractors, ...staff].map((u) => u.id) }, status: { in: OPEN_STATUSES }, id: { not: ticket.id } },
    _count: { _all: true },
  });
  const jobs = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
  const { options: picks } = await suggestAssignees(db, ticket.id, now, 3);
  return {
    suggestions: picks.map((o) => ({ id: o.userId, name: shortName(o.name), reasons: o.reasons, startsLabel: formatClock(o.startsAt), score: o.score })),
    contractors: contractors
      .filter((u) => u.contractorProfile)
      .map((u) => {
        const p = u.contractorProfile!;
        const active = jobs.get(u.id) ?? 0;
        return {
          id: u.id,
          name: u.name,
          company: p.companyName,
          availability: p.availability,
          activeJobs: active,
          maxActiveJobs: p.maxActiveJobs,
          problems: assignmentProblems({ ...p, userId: u.id, role: u.role, disabledAt: u.disabledAt }, ticket, active, now),
        };
      }),
    staff: staff.map((u) => ({ id: u.id, name: u.name, activeJobs: jobs.get(u.id) ?? 0 })),
  };
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

export type MyTicketsTab = "reported" | "room" | "following" | "metoo";

/** The student's own lists: what they reported, what's in their room, what they follow, and their "me too"s. */
export async function listMyTicketsTab(db: Db, viewer: Viewer, tab: MyTicketsTab) {
  const filter: Prisma.TicketWhereInput =
    tab === "reported"
      ? { reporterId: viewer.id }
      : tab === "room"
        ? viewer.roomId
          ? { scope: "ROOM", spaceId: viewer.roomId }
          : { id: "__none__" }
        : tab === "following"
          ? { followers: { some: { userId: viewer.id } } }
          : { meToos: { some: { userId: viewer.id } } };
  return db.ticket.findMany({ where: visibleTickets(viewer, filter), include: listInclude, orderBy: [{ updatedAt: "desc" }] });
}

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
