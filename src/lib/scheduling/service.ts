// Scheduling against the database: loads calendars, runs the engine, writes
// ScheduledJob rows, and keeps them in sync with work and reassignments.
import type { Prisma, PrismaClient } from "@prisma/client";
import { OPEN_STATUSES, CATEGORIES, SEVERITY_RANK, SKILL_LABEL, isSeverity, parseKeyList, parseWorkDays, type Severity } from "../domain";
import { assignmentProblems } from "../eligibility";
import { AppError } from "../errors";
import { notifyTicket } from "../notify";
import { can, isStaff, type Viewer } from "../visibility";
import { MAX_BREAK_MINUTES, breakProblem } from "./breaks";
import { evaluate, planAssignment, rankPlannable, reflowJobs, type Block, type EngineCandidate, type EngineTicket, type Shift } from "./engine";
import { contractorSkillSet, parseSkills } from "./skills";
import { MIN, campusDayAt, campusDayStart, campusTimeOn, formatClock, formatDay } from "./time";

type Db = PrismaClient;
type Tx = PrismaClient | Prisma.TransactionClient;
const ACTIVE = ["SCHEDULED", "IN_PROGRESS"];
const EMERGENCY_RANK = SEVERITY_RANK.EMERGENCY;

function shortName(name: string): string {
  const [first, ...rest] = name.split(" ");
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

const loadTicket = (db: Tx, id: string) =>
  db.ticket.findUnique({
    where: { id },
    include: { building: { select: { name: true } } },
  });

export function engineTicket(t: {
  id: string;
  number: number;
  lat: number;
  lng: number;
  severity: string;
  requiredSkills: string;
  estimatedMinutes: number;
  responseDueAt: Date;
  meTooCount: number;
}): EngineTicket {
  return {
    id: t.id,
    number: t.number,
    loc: { lat: t.lat, lng: t.lng },
    severity: (isSeverity(t.severity) ? t.severity : "STANDARD") as Severity,
    requiredSkills: parseSkills(t.requiredSkills),
    estimatedMinutes: Math.max(15, t.estimatedMinutes),
    responseDueAt: t.responseDueAt,
    meTooCount: t.meTooCount,
  };
}

const shiftOf = (p: { shiftStartMinute: number; shiftEndMinute: number; workDays: string; onCall: boolean }): Shift => ({
  shiftStartMinute: p.shiftStartMinute,
  shiftEndMinute: p.shiftEndMinute,
  workDays: parseWorkDays(p.workDays),
  onCall: p.onCall,
});

const rankOf = (severity: string) => SEVERITY_RANK[(isSeverity(severity) ? severity : "STANDARD") as Severity];

/** An internal note for dispatchers, written once per distinct message. */
async function warnOnce(db: Tx, ticketId: string, message: string, now: Date) {
  const seen = await db.ticketEvent.findFirst({
    where: { ticketId, internal: true, message },
  });
  if (!seen)
    await db.ticketEvent.create({
      data: { ticketId, type: "NOTE", internal: true, message, createdAt: now },
    });
}

/**
 * Everything the scheduler needs to know about a set of contractors, loaded once: their
 * calendars, breaks, last known locations and open-job counts. Rank any number of tickets
 * against it with candidatesFor, with no further queries.
 */
async function loadPool(db: Db, who: { department: string } | { ids: string[] }, now: Date) {
  const users = await db.user.findMany({
    where: {
      role: "CONTRACTOR",
      ...("ids" in who ? { id: { in: who.ids } } : { contractorProfile: { departments: { contains: who.department } } }),
    },
    include: { contractorProfile: true },
    orderBy: { name: "asc" },
  });
  const ids = users.map((u) => u.id);
  const [rows, breaks, latest, assigned] = await Promise.all([
    db.scheduledJob.findMany({
      where: { contractorId: { in: ids }, status: { in: ACTIVE } },
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            lat: true,
            lng: true,
            severity: true,
          },
        },
      },
    }),
    db.contractorBreak.findMany({
      where: { contractorId: { in: ids }, endsAt: { gt: now } },
    }),
    db.workLog.groupBy({
      by: ["contractorId"],
      where: { contractorId: { in: ids }, startedAt: { lte: now } },
      _max: { startedAt: true },
    }),
    db.ticket.findMany({
      where: { assigneeId: { in: ids }, status: { in: OPEN_STATUSES } },
      select: { id: true, assigneeId: true },
    }),
  ]);
  const lastLogs = latest.length
    ? await db.workLog.findMany({
        where: {
          OR: latest.map((l) => ({
            contractorId: l.contractorId,
            startedAt: l._max.startedAt!,
          })),
        },
        select: {
          contractorId: true,
          ticket: { select: { lat: true, lng: true } },
        },
      })
    : [];
  const lastLoc = new Map(lastLogs.map((l) => [l.contractorId, { lat: l.ticket.lat, lng: l.ticket.lng }]));
  return { users, rows, breaks, lastLoc, assigned };
}
type Pool = Awaited<ReturnType<typeof loadPool>>;

/** Calendars, locations and eligibility for the pool's contractors, as seen by one ticket. */
function candidatesFor(
  pool: Pool,
  ticket: {
    id: string;
    department: string;
    category: string;
    scope: string;
    requiredSkills: string;
  },
  now: Date,
) {
  return pool.users
    .filter((u) => u.contractorProfile)
    .map((u) => {
      const p = u.contractorProfile!;
      const mine = pool.rows.filter((r) => r.contractorId === u.id && r.ticketId !== ticket.id);
      const openJobs = pool.assigned.filter((t) => t.assigneeId === u.id && t.id !== ticket.id).length + mine.filter((r) => r.role === "HELPER").length;
      const who = {
        ...p,
        userId: u.id,
        role: u.role,
        disabledAt: u.disabledAt,
      };
      const what = {
        department: ticket.department,
        category: ticket.category,
        scope: ticket.scope,
        requiredSkills: ticket.requiredSkills,
      };
      const blocks: Block[] = [
        ...mine.map((r): Block => ({
          id: r.id,
          kind: "JOB",
          start: r.startsAt.getTime(),
          end: r.status === "IN_PROGRESS" ? Math.max(r.endsAt.getTime(), now.getTime()) : r.endsAt.getTime(),
          loc: { lat: r.ticket.lat, lng: r.ticket.lng },
          rank: rankOf(r.ticket.severity),
          movable: r.status === "SCHEDULED",
          ticketId: r.ticket.id,
          ticketNumber: r.ticket.number,
        })),
        ...pool.breaks
          .filter((b) => b.contractorId === u.id)
          .map((b): Block => ({
            id: b.id,
            kind: "BREAK",
            start: b.startsAt.getTime(),
            end: b.endsAt.getTime(),
          })),
      ];
      const loc = pool.lastLoc.get(u.id);
      const candidate: EngineCandidate = {
        userId: u.id,
        name: u.name,
        shift: shiftOf(p),
        skills: contractorSkillSet(p, parseKeyList(p.trades, CATEGORIES)),
        blocks,
        origin: loc ? { loc, at: now.getTime() } : null,
        openJobs,
        maxJobs: p.maxActiveJobs,
      };
      return {
        user: u,
        /** What a dispatcher's manual "assign now" checks. */
        problems: assignmentProblems(who, what, openJobs, now),
        /** What the auto-scheduler checks: shifts decide when, so off duty doesn't rule anyone out. */
        schedProblems: assignmentProblems(who, what, openJobs, now, {
          forScheduling: true,
        }),
        candidate,
      };
    });
}

// ---------------------------------------------------------------------------
// Suggestions

export type Suggestion = {
  userId: string;
  name: string;
  score: number;
  reasons: string;
  startsAt: Date;
  travelMinutes: number;
};
export type Suggestions = {
  options: Suggestion[];
  /** Every other eligible contractor, best first. */ others: Suggestion[];
  ineligible: { name: string; problems: string[] }[];
};

const toSuggestion = (e: ReturnType<typeof rankPlannable>[number]): Suggestion => ({
  userId: e.candidate.userId,
  name: e.candidate.name,
  score: e.score,
  reasons: e.reasons,
  startsAt: new Date(e.slot.start),
  travelMinutes: e.slot.travel,
});

/**
 * The scheduler's best contractors for several tickets at once (the staff queue). Each department's
 * contractors, calendars and locations are loaded once and every ticket is ranked in memory.
 * Uses the same candidate filter as planAssignment, plus manual-assign eligibility.
 */
export async function suggestAssigneesForTickets(db: Db, ticketIds: string[], now: Date, limit = 3): Promise<Map<string, Suggestions>> {
  const out = new Map<string, Suggestions>();
  if (!ticketIds.length) return out;
  const tickets = await db.ticket.findMany({
    where: { id: { in: ticketIds } },
  });
  const byDept = new Map<string, typeof tickets>();
  for (const t of tickets) byDept.set(t.department, [...(byDept.get(t.department) ?? []), t]);
  for (const [department, list] of byDept) {
    const pool = await loadPool(db, { department }, now);
    for (const ticket of list) {
      const all = candidatesFor(pool, ticket, now);
      const ranked = rankPlannable(
        engineTicket(ticket),
        all.filter((c) => !c.problems.length).map((c) => c.candidate),
        now.getTime(),
      );
      out.set(ticket.id, {
        options: ranked.slice(0, limit).map(toSuggestion),
        others: ranked.slice(limit).map(toSuggestion),
        ineligible: all.filter((c) => c.problems.length).map((c) => ({ name: c.user.name, problems: c.problems })),
      });
    }
  }
  return out;
}

/** The scheduler's best contractors for a ticket (for the ticket page). */
export async function suggestAssignees(db: Db, ticketId: string, now: Date, limit = 3): Promise<Suggestions> {
  return (await suggestAssigneesForTickets(db, [ticketId], now, limit)).get(ticketId) ?? { options: [], others: [], ineligible: [] };
}

// ---------------------------------------------------------------------------
// Placing rows safely

class SlotConflict extends Error {}

type NewRow = {
  contractorId: string;
  role: string;
  start: number;
  end: number;
  travel: number;
  score: number;
  reasons: string;
};

/**
 * Write a ticket's schedule rows inside a transaction, then re-read each contractor's calendar
 * and capacity under the write lock. Anything that overlaps (another dispatch won the slot, a
 * break was added) or exceeds their job limit throws SlotConflict so the caller's transaction
 * rolls back. An Emergency may overlap lower-priority SCHEDULED jobs: those get pushed later.
 */
async function insertVerifiedRows(tx: Prisma.TransactionClient, ticketId: string, rows: NewRow[], emergency: boolean, now: Date): Promise<string[]> {
  const created: string[] = [];
  for (const r of rows) {
    const row = await tx.scheduledJob.create({
      data: {
        ticketId,
        contractorId: r.contractorId,
        role: r.role,
        startsAt: new Date(r.start),
        endsAt: new Date(r.end),
        travelMinutes: r.travel,
        score: r.score,
        reasons: r.reasons,
        createdAt: now,
      },
    });
    created.push(row.id);
  }
  for (const r of rows) {
    const [others, breaks, profile, assigned, helping] = await Promise.all([
      tx.scheduledJob.findMany({
        where: {
          contractorId: r.contractorId,
          status: { in: ACTIVE },
          ticketId: { not: ticketId },
        },
        include: { ticket: { select: { severity: true } } },
      }),
      tx.contractorBreak.findMany({
        where: {
          contractorId: r.contractorId,
          endsAt: { gt: new Date(r.start) },
        },
      }),
      tx.contractorProfile.findUnique({ where: { userId: r.contractorId } }),
      tx.ticket.count({
        where: {
          assigneeId: r.contractorId,
          status: { in: OPEN_STATUSES },
          id: { not: ticketId },
        },
      }),
      tx.scheduledJob.count({
        where: {
          contractorId: r.contractorId,
          role: "HELPER",
          status: { in: ACTIVE },
          ticketId: { not: ticketId },
        },
      }),
    ]);
    if (!profile) throw new SlotConflict();
    if (assigned + helping >= profile.maxActiveJobs) throw new SlotConflict();
    for (const o of others) {
      const end = o.status === "IN_PROGRESS" ? Math.max(o.endsAt.getTime(), now.getTime()) : o.endsAt.getTime();
      const bumpable = emergency && o.status === "SCHEDULED" && rankOf(o.ticket.severity) < EMERGENCY_RANK;
      if (!bumpable && r.start < end && r.end > o.startsAt.getTime()) throw new SlotConflict();
    }
    if (breaks.some((b) => r.start < b.endsAt.getTime() && r.end > b.startsAt.getTime())) throw new SlotConflict();
  }
  return created;
}

// ---------------------------------------------------------------------------
// Auto-assignment

export type AutoAssignResult =
  | {
      status: "assigned";
      assigneeId: string;
      helperIds: string[];
      startsAt: Date;
    }
  | { status: "unassignable"; reason: string }
  | { status: "skipped"; reason: string };

export async function autoAssignTicket(db: Db, ticketId: string, now: Date, attempt = 0): Promise<AutoAssignResult> {
  const ticket = await loadTicket(db, ticketId);
  if (!ticket) return { status: "skipped", reason: "No such ticket" };
  if (ticket.assigneeId || ticket.status !== "TRIAGED")
    return {
      status: "skipped",
      reason: "Already assigned or not waiting for dispatch",
    };

  const all = candidatesFor(await loadPool(db, { department: ticket.department }, now), ticket, now);
  const eligible = all.filter((c) => !c.schedProblems.length);
  const plan = planAssignment(
    engineTicket(ticket),
    eligible.map((c) => c.candidate),
    now.getTime(),
  );
  if (!plan) {
    const why = all.length
      ? all
          .slice(0, 4)
          .map((c) => `${shortName(c.user.name)}: ${c.schedProblems[0] ?? "no open slot in the next two weeks"}`)
          .join("; ")
      : "no contractors work for this department";
    const message = `Auto-assign found nobody: ${why}. Needs a dispatcher.`;
    await warnOnce(db, ticketId, message, now);
    return { status: "unassignable", reason: message };
  }

  const primary = plan.members[0];
  const helpers = plan.members.slice(1);
  const emergency = ticket.severity === "EMERGENCY";
  const name = shortName(primary.evaluation.candidate.name);
  const skills = primary.evaluation.covered.map((s) => SKILL_LABEL[s]).join(" + ");
  const when = `${formatClock(primary.start)}${campusDayStart(primary.start) === campusDayStart(now.getTime()) ? "" : ` ${formatDay(primary.start)}`}`;
  const message =
    `Auto-assigned to ${name} (${skills ? `${skills}, ` : ""}${primary.evaluation.candidate.origin?.loc ? `${primary.travel} min away` : "nearest free"}), starts ${when}` +
    (helpers.length ? `, with ${helpers.map((h) => shortName(h.evaluation.candidate.name)).join(" and ")} helping` : "");

  let won: { rowIds: string[] } | null;
  try {
    won = await db.$transaction(async (tx) => {
      // Claiming the ticket is a write, which also takes the database's write lock: what we
      // re-read below can't change under us.
      const claimed = await tx.ticket.updateMany({
        where: { id: ticketId, assigneeId: null, status: "TRIAGED" },
        // firstResponseAt stays empty: only a person acting (or work starting) counts as a response.
        data: {
          status: "ASSIGNED",
          assigneeId: primary.evaluation.candidate.userId,
          updatedAt: now,
        },
      });
      if (claimed.count === 0) return null; // somebody else got there first
      const rowIds = await insertVerifiedRows(
        tx,
        ticketId,
        plan.members.map((m) => ({
          contractorId: m.evaluation.candidate.userId,
          role: m.role,
          start: m.start,
          end: m.end,
          travel: m.travel,
          score: m.evaluation.score,
          reasons: m.reasons,
        })),
        emergency,
        now,
      );
      const updated = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "STATUS",
          fromStatus: "TRIAGED",
          toStatus: "ASSIGNED",
          message,
          actorId: null,
          createdAt: now,
        },
      });
      await notifyTicket(tx, {
        ticket: updated,
        message: `A contractor (${name}) is assigned to RR-${updated.number}`,
        actorId: null,
        now,
      });
      await notifyTicket(tx, {
        ticket: updated,
        message: `New job: RR-${updated.number} ${updated.summary}. Starts ${when}.`,
        now,
        includeWatchers: false,
        extraUserIds: [primary.evaluation.candidate.userId],
      });
      for (const h of helpers) {
        const at = `${formatClock(h.start)}${campusDayStart(h.start) === campusDayStart(now.getTime()) ? "" : ` ${formatDay(h.start)}`}`;
        await notifyTicket(tx, {
          ticket: updated,
          message: `Helper needed on RR-${updated.number} with ${name} at ${at}: ${updated.summary}`,
          now,
          includeWatchers: false,
          extraUserIds: [h.evaluation.candidate.userId],
        });
      }
      return { rowIds };
    });
  } catch (err) {
    if (!(err instanceof SlotConflict)) throw err;
    // The calendars changed between planning and writing. Plan again once, then give up politely.
    if (attempt < 1) return autoAssignTicket(db, ticketId, now, attempt + 1);
    const reason = "Auto-assign couldn't lock in a slot because the schedules kept changing. Needs a dispatcher.";
    await warnOnce(db, ticketId, reason, now);
    return { status: "unassignable", reason };
  }
  if (!won) return { status: "skipped", reason: "Another dispatch got there first" };

  // Anything an Emergency bumped is pushed later (never dropped) and its owner is told what really moved.
  // The new rows are pinned so the bumped job can't keep the slot it was displaced from.
  if (emergency) {
    const mine = await db.scheduledJob.findMany({
      where: { id: { in: won.rowIds } },
      select: { id: true, contractorId: true },
    });
    for (const m of plan.members) {
      if (!m.evaluation.slot.displaced.length) continue;
      const contractorId = m.evaluation.candidate.userId;
      const moved = await reflowContractor(db, contractorId, now, {
        pin: mine.filter((r) => r.contractorId === contractorId).map((r) => r.id),
      });
      if (moved.length) {
        await db.notification.createMany({
          data: moved.map((b) => ({
            userId: contractorId,
            ticketId: b.ticketId,
            message: `RR-${b.ticketNumber} was pushed back to ${formatClock(b.to)} for an Emergency (RR-${ticket.number}).`,
            tone: "warning",
            createdAt: now,
          })),
        });
      }
    }
  }
  return {
    status: "assigned",
    assigneeId: primary.evaluation.candidate.userId,
    helperIds: helpers.map((h) => h.evaluation.candidate.userId),
    startsAt: new Date(primary.start),
  };
}

// ---------------------------------------------------------------------------
// Keeping the calendar in sync

/**
 * Push SCHEDULED jobs later around breaks and in-progress work. Returns what moved. `pin` names
 * rows that must stay put (just-placed Emergencies). A moved lead's helper rows move with it.
 * A job nothing fits is left where it is and flagged to dispatchers in an internal note.
 */
export async function reflowContractor(db: Tx, contractorId: string, now: Date, opts: { pin?: string[]; depth?: number } = {}) {
  const profile = await db.contractorProfile.findUnique({
    where: { userId: contractorId },
    include: { user: { select: { name: true } } },
  });
  if (!profile) return [];
  const pin = new Set(opts.pin ?? []);
  const [rows, breaks, last] = await Promise.all([
    db.scheduledJob.findMany({
      where: { contractorId, status: { in: ACTIVE } },
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            lat: true,
            lng: true,
            severity: true,
          },
        },
      },
    }),
    db.contractorBreak.findMany({
      where: { contractorId, endsAt: { gt: now } },
    }),
    db.workLog.findFirst({
      where: { contractorId, startedAt: { lte: now } },
      orderBy: { startedAt: "desc" },
      include: { ticket: { select: { lat: true, lng: true } } },
    }),
  ]);
  const toBlock = (r: (typeof rows)[number]): Block => ({
    id: r.id,
    kind: "JOB",
    start: r.startsAt.getTime(),
    end: r.status === "IN_PROGRESS" ? Math.max(r.endsAt.getTime(), now.getTime()) : r.endsAt.getTime(),
    loc: { lat: r.ticket.lat, lng: r.ticket.lng },
    rank: rankOf(r.ticket.severity),
    movable: r.status === "SCHEDULED",
    pinned: pin.has(r.id),
    ticketId: r.ticket.id,
    ticketNumber: r.ticket.number,
  });
  const fixed: Block[] = [
    ...rows.filter((r) => r.status === "IN_PROGRESS").map(toBlock),
    ...breaks.map((b): Block => ({
      id: b.id,
      kind: "BREAK",
      start: b.startsAt.getTime(),
      end: b.endsAt.getTime(),
    })),
  ];
  const movable = rows.filter((r) => r.status === "SCHEDULED");
  const placed = reflowJobs({
    shift: shiftOf(profile),
    fixed,
    jobs: movable.map(toBlock),
    origin: last
      ? {
          loc: { lat: last.ticket.lat, lng: last.ticket.lng },
          at: now.getTime(),
        }
      : null,
    now: now.getTime(),
  });
  const moved: {
    ticketId: string;
    ticketNumber: number;
    from: Date;
    to: Date;
  }[] = [];
  for (const r of movable) {
    const p = placed.get(r.id);
    if (!p) continue;
    if (!p.fit) {
      await warnOnce(
        db,
        r.ticket.id,
        `Couldn't fit this job in ${shortName(profile.user.name)}'s schedule. It overlaps something else, so check their calendar.`,
        now,
      );
      continue;
    }
    if (p.start === r.startsAt.getTime() && p.end === r.endsAt.getTime()) continue;
    await db.scheduledJob.update({
      where: { id: r.id },
      data: {
        startsAt: new Date(p.start),
        endsAt: new Date(p.end),
        travelMinutes: p.travel,
      },
    });
    moved.push({
      ticketId: r.ticket.id,
      ticketNumber: r.ticket.number,
      from: r.startsAt,
      to: new Date(p.start),
    });
    if (r.role === "PRIMARY") await moveHelpersWith(db, r.ticket.id, r.ticket.number, contractorId, p.start, now, opts.depth ?? 0);
  }
  return moved;
}

/** A lead's job moved: its helpers' rows move to the same start, and their calendars settle around it. */
async function moveHelpersWith(db: Tx, ticketId: string, number: number, leadId: string, start: number, now: Date, depth: number) {
  const helpers = await db.scheduledJob.findMany({
    where: {
      ticketId,
      role: "HELPER",
      status: "SCHEDULED",
      contractorId: { not: leadId },
    },
  });
  for (const h of helpers) {
    const dur = h.endsAt.getTime() - h.startsAt.getTime();
    if (h.startsAt.getTime() === start) continue;
    await db.scheduledJob.update({
      where: { id: h.id },
      data: { startsAt: new Date(start), endsAt: new Date(start + dur) },
    });
    await db.notification.create({
      data: {
        userId: h.contractorId,
        ticketId,
        message: `RR-${number} moved to ${formatClock(start)}: the lead's schedule changed.`,
        tone: "warning",
        createdAt: now,
      },
    });
    if (depth < 1)
      await reflowContractor(db, h.contractorId, now, {
        pin: [h.id],
        depth: depth + 1,
      });
  }
}

/** Staff reassigned or the ticket left the queue: the old slots are gone. */
export async function cancelScheduledJobs(db: Tx, ticketId: string) {
  await db.scheduledJob.updateMany({
    where: { ticketId, status: { in: ACTIVE } },
    data: { status: "CANCELLED" },
  });
}

/** A dispatcher picked the contractor: put the job on their calendar at the first free slot. */
export async function scheduleManualAssignment(db: Db, ticketId: string, contractorId: string, now: Date) {
  await cancelScheduledJobs(db, ticketId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = await loadTicket(db, ticketId);
    if (!ticket) return;
    const [entry] = candidatesFor(await loadPool(db, { ids: [contractorId] }, now), ticket, now);
    if (!entry) return; // staff assignee: nothing to schedule
    const ev = evaluate(engineTicket(ticket), entry.candidate, now.getTime());
    if (!ev) {
      await warnOnce(
        db,
        ticketId,
        `Couldn't find an open slot in ${shortName(entry.user.name)}'s schedule for this job, so it isn't on their calendar. Check their availability.`,
        now,
      );
      return;
    }
    try {
      const ids = await db.$transaction((tx) =>
        insertVerifiedRows(
          tx,
          ticketId,
          [
            {
              contractorId,
              role: "PRIMARY",
              start: ev.slot.start,
              end: ev.slot.end,
              travel: ev.slot.travel,
              score: ev.score,
              reasons: `Assigned by a dispatcher · ${ev.reasons}`,
            },
          ],
          ticket.severity === "EMERGENCY",
          now,
        ),
      );
      if (ev.slot.displaced.length) {
        const moved = await reflowContractor(db, contractorId, now, {
          pin: ids,
        });
        if (moved.length) {
          await db.notification.createMany({
            data: moved.map((b) => ({
              userId: contractorId,
              ticketId: b.ticketId,
              message: `RR-${b.ticketNumber} was pushed back to ${formatClock(b.to)} for an Emergency (RR-${ticket.number}).`,
              tone: "warning",
              createdAt: now,
            })),
          });
        }
      }
      return;
    } catch (err) {
      if (!(err instanceof SlotConflict)) throw err;
    }
  }
  await warnOnce(db, ticketId, "Couldn't put this job on the contractor's calendar because their schedule kept changing. Check it.", now);
}

/**
 * A dispatcher changed the category or severity of a ticket nobody has started. Re-plan it: an
 * auto-assigned ticket goes back through auto-assign (so a new Emergency can bump work and new
 * skills get helpers); a hand-assigned one keeps its contractor and gets a fresh slot.
 */
export async function replanAfterChange(db: Db, ticketId: string, now: Date) {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status !== "ASSIGNED" || !ticket.assigneeId) return;
  const primary = await db.scheduledJob.findFirst({
    where: { ticketId, role: "PRIMARY", status: "SCHEDULED" },
  });
  if (!primary) return; // not scheduled, or already started
  if (primary.reasons.startsWith("Assigned by a dispatcher")) return void (await scheduleManualAssignment(db, ticketId, ticket.assigneeId, now));
  await db.$transaction([
    db.ticket.update({
      where: { id: ticketId },
      data: { status: "TRIAGED", assigneeId: null, updatedAt: now },
    }),
    db.scheduledJob.updateMany({
      where: { ticketId, status: { in: ACTIVE } },
      data: { status: "CANCELLED" },
    }),
    db.ticketEvent.create({
      data: {
        ticketId,
        type: "STATUS",
        fromStatus: "ASSIGNED",
        toStatus: "TRIAGED",
        message: "Re-planning: the report changed after it was auto-assigned",
        internal: true,
        createdAt: now,
      },
    }),
  ]);
  await autoAssignTicket(db, ticketId, now);
}

/** The contractor tapped "Start work". */
export async function markJobStarted(db: Db, ticketId: string, contractorId: string, now: Date) {
  const row = await db.scheduledJob.findFirst({
    where: { ticketId, contractorId, status: { in: ACTIVE } },
  });
  if (row) {
    const dur = row.endsAt.getTime() - row.startsAt.getTime();
    await db.scheduledJob.update({
      where: { id: row.id },
      data: {
        status: "IN_PROGRESS",
        startsAt: now,
        endsAt: new Date(now.getTime() + dur),
      },
    });
  } else {
    const t = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { estimatedMinutes: true },
    });
    await db.scheduledJob.create({
      data: {
        ticketId,
        contractorId,
        role: "PRIMARY",
        startsAt: now,
        endsAt: new Date(now.getTime() + (t?.estimatedMinutes ?? 60) * MIN),
        status: "IN_PROGRESS",
        reasons: "Started without a scheduled slot",
        createdAt: now,
      },
    });
  }
  await reflowContractor(db, contractorId, now);
}

/**
 * The job was resolved. The finisher's slot (and anyone else who logged work on it) is DONE;
 * slots of people who never started (helpers, backups) are cancelled, since DONE would read
 * as "worked on it".
 */
export async function completeScheduledJobs(db: Db, ticketId: string, finisherId: string, now: Date) {
  const rows = await db.scheduledJob.findMany({
    where: { ticketId, status: { in: ACTIVE } },
  });
  const worked = new Set(
    (
      await db.workLog.findMany({
        where: { ticketId },
        select: { contractorId: true },
      })
    ).map((w) => w.contractorId),
  );
  for (const r of rows) {
    const mine = r.contractorId === finisherId;
    if (!mine && !worked.has(r.contractorId)) {
      await db.scheduledJob.update({
        where: { id: r.id },
        data: { status: "CANCELLED" },
      });
      continue;
    }
    await db.scheduledJob.update({
      where: { id: r.id },
      data: {
        status: "DONE",
        ...(mine
          ? {
              endsAt: now,
              startsAt: r.startsAt.getTime() > now.getTime() ? new Date(now.getTime() - MIN) : r.startsAt,
            }
          : {}),
      },
    });
  }
}

/** A break that has ended no longer shows the contractor as "On a break". */
export async function expireBreakStatus(db: Db, contractorId: string, now: Date) {
  const current = await db.contractorBreak.count({
    where: { contractorId, startsAt: { lte: now }, endsAt: { gt: now } },
  });
  if (current) return;
  const working = await db.workLog.count({
    where: { contractorId, endedAt: null },
  });
  await db.contractorProfile.updateMany({
    where: { userId: contractorId, availability: "ON_BREAK" },
    data: { availability: working ? "ON_JOB" : "AVAILABLE" },
  });
}

// ---------------------------------------------------------------------------
// Reading a calendar

export async function loadContractorDay(db: Db, contractorId: string, dayStart: number, now: Date) {
  const dayEnd = campusDayAt(dayStart, 1);
  const [jobs, breaks] = await Promise.all([
    db.scheduledJob.findMany({
      where: {
        contractorId,
        status: { not: "CANCELLED" },
        startsAt: { lt: new Date(dayEnd) },
        endsAt: { gt: new Date(dayStart) },
      },
      orderBy: { startsAt: "asc" },
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            summary: true,
            severity: true,
            status: true,
            building: { select: { name: true } },
            space: { select: { label: true } },
          },
        },
      },
    }),
    db.contractorBreak.findMany({
      where: {
        contractorId,
        startsAt: { lt: new Date(dayEnd) },
        endsAt: { gt: new Date(dayStart) },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  void now;
  return { jobs, breaks };
}

export type DayItem =
  | {
      kind: "JOB";
      id: string;
      start: number;
      end: number;
      travel: number;
      role: string;
      status: string;
      score: number;
      reasons: string;
      ticketId: string;
      number: number;
      summary: string;
      severity: string;
      where: string;
    }
  | {
      kind: "BREAK";
      id: string;
      start: number;
      end: number;
      reason: string | null;
    };

export function dayItems(day: Awaited<ReturnType<typeof loadContractorDay>>): DayItem[] {
  return [
    ...day.jobs.map((j): DayItem => ({
      kind: "JOB",
      id: j.id,
      start: j.startsAt.getTime(),
      end: j.endsAt.getTime(),
      travel: j.travelMinutes,
      role: j.role,
      status: j.status,
      score: j.score,
      reasons: j.reasons,
      ticketId: j.ticket.id,
      number: j.ticket.number,
      summary: j.ticket.summary,
      severity: j.ticket.severity,
      where: [j.ticket.building.name, j.ticket.space?.label].filter(Boolean).join(" · "),
    })),
    ...day.breaks.map((b): DayItem => ({
      kind: "BREAK",
      id: b.id,
      start: b.startsAt.getTime(),
      end: b.endsAt.getTime(),
      reason: b.reason,
    })),
  ].sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Breaks

export type BreakInput = {
  dayOffset: number;
  startTime: string;
  minutes?: number;
  endTime?: string;
  reason?: string | null;
};
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function requireContractor(viewer: Viewer) {
  if (viewer.role !== "CONTRACTOR") throw new AppError("Only contractors manage their own breaks.", "FORBIDDEN");
}

async function createBreak(db: Db, contractorId: string, start: number, end: number, reason: string | null, now: Date) {
  const day = campusDayStart(start);
  await db.$transaction(async (tx) => {
    // Insert first (it takes the write lock), then check against what's really there; a problem rolls it back.
    const created = await tx.contractorBreak.create({
      data: {
        contractorId,
        startsAt: new Date(start),
        endsAt: new Date(end),
        reason,
        createdAt: now,
      },
    });
    const [existing, active] = await Promise.all([
      tx.contractorBreak.findMany({
        where: {
          contractorId,
          id: { not: created.id },
          endsAt: { gt: new Date(now.getTime() - 86_400_000) },
        },
      }),
      tx.scheduledJob.findMany({
        where: { contractorId, status: "IN_PROGRESS" },
      }),
    ]);
    const problem = breakProblem({
      start,
      end,
      now: now.getTime(),
      existing: existing.map((b) => ({
        start: b.startsAt.getTime(),
        end: b.endsAt.getTime(),
      })),
      // A job in progress lasts at least until now; breaks can't sit on top of it.
      inProgress: active.map((j) => ({
        start: j.startsAt.getTime(),
        end: Math.max(j.endsAt.getTime(), now.getTime()),
      })),
      sameDayCount: existing.filter((b) => campusDayStart(b.startsAt.getTime()) === day).length,
    });
    if (problem) throw new AppError(problem);
  });
  return reflowContractor(db, contractorId, now);
}

/** Add a break (today or up to a week ahead) and push later jobs back around it. */
export async function addBreak(db: Db, viewer: Viewer, input: BreakInput, now: Date) {
  requireContractor(viewer);
  if (!Number.isInteger(input.dayOffset) || input.dayOffset < 0 || input.dayOffset > 7) throw new AppError("Choose a day in the next week.");
  if (!TIME.test(input.startTime)) throw new AppError("Choose a start time.");
  const day = campusDayAt(now.getTime(), input.dayOffset);
  const start = campusTimeOn(day, minutesOf(input.startTime));
  let end: number;
  if (input.endTime !== undefined && input.endTime !== "") {
    if (!TIME.test(input.endTime)) throw new AppError("Choose an end time.");
    end = campusTimeOn(day, minutesOf(input.endTime));
  } else {
    if (!Number.isInteger(input.minutes) || (input.minutes ?? 0) < 5) throw new AppError("Choose how long the break is.");
    end = start + input.minutes! * MIN;
  }
  const reason = input.reason?.trim().slice(0, 80) || null;
  const moved = await createBreak(db, viewer.id, start, end, reason, now);
  return { moved: moved.length };
}

/** Delete a break that hasn't started. Use "Back to work" to end one in progress. */
export async function deleteBreak(db: Db, viewer: Viewer, breakId: string, now: Date) {
  requireContractor(viewer);
  const b = await db.contractorBreak.findUnique({ where: { id: breakId } });
  if (!b || b.contractorId !== viewer.id) throw new AppError("That break doesn't exist.", "NOT_FOUND");
  if (b.startsAt.getTime() <= now.getTime()) throw new AppError("That break has already started. Use Back to work to end it.", "CONFLICT");
  await db.contractorBreak.delete({ where: { id: breakId } });
}

export async function takeBreakNow(db: Db, viewer: Viewer, minutes: number, now: Date) {
  requireContractor(viewer);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > MAX_BREAK_MINUTES) throw new AppError("Choose how long the break is.");
  const working = await db.workLog.count({
    where: { contractorId: viewer.id, endedAt: null },
  });
  if (working) throw new AppError("Finish the job you're working on before taking a break.", "CONFLICT");
  const profile = await db.contractorProfile.findUnique({
    where: { userId: viewer.id },
  });
  if (!profile || profile.availability === "OFF_DUTY") throw new AppError("Set yourself available before taking a break.", "CONFLICT");
  await createBreak(db, viewer.id, now.getTime(), now.getTime() + minutes * MIN, "Break", now);
  await db.contractorProfile.update({
    where: { userId: viewer.id },
    data: { availability: "ON_BREAK" },
  });
}

export async function backToWork(db: Db, viewer: Viewer, now: Date) {
  requireContractor(viewer);
  const current = await db.contractorBreak.findMany({
    where: {
      contractorId: viewer.id,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
  });
  for (const b of current) {
    if (b.startsAt.getTime() >= now.getTime() - MIN) await db.contractorBreak.delete({ where: { id: b.id } });
    else
      await db.contractorBreak.update({
        where: { id: b.id },
        data: { endsAt: now },
      });
  }
  const working = await db.workLog.count({
    where: { contractorId: viewer.id, endedAt: null },
  });
  await db.contractorProfile.updateMany({
    where: { userId: viewer.id, availability: "ON_BREAK" },
    data: { availability: working ? "ON_JOB" : "AVAILABLE" },
  });
}

/** Staff pressed "Auto-assign": same checks as a manual assignment, then the scheduler picks. */
export async function staffAutoAssign(db: Db, viewer: Viewer, ticketId: string, now: Date) {
  if (!isStaff(viewer)) throw new AppError("Only staff can do that.", "FORBIDDEN");
  if (!can(viewer, "canAssignWork")) throw new AppError("You don't have permission to assign work.", "FORBIDDEN");
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("That ticket doesn't exist.", "NOT_FOUND");
  if (viewer.role === "STAFF" && ticket.department !== viewer.department) throw new AppError("This ticket belongs to another department.", "FORBIDDEN");
  const result = await autoAssignTicket(db, ticketId, now);
  if (result.status === "unassignable") throw new AppError(result.reason, "CONFLICT");
  if (result.status === "skipped") throw new AppError("It's already assigned or isn't waiting for dispatch.", "CONFLICT");
  return result;
}
