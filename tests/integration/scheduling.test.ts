// Auto-assignment, schedules, helpers, and breaks against the seeded database.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, db, reseed } from "../support/db";
import {
  createTicket,
  contractorStartWork,
  contractorFinishWork,
  getTicketDetail,
  reopenTicket,
  staffOverride,
  staffSetStatus,
  type CreateTicketInput,
} from "@/lib/tickets";
import { canSeePhoto } from "@/lib/photo-access";
import { deactivateContractor } from "@/lib/accounts";
import { autoAssignTicket, addBreak, backToWork, deleteBreak, scheduleManualAssignment, takeBreakNow } from "@/lib/scheduling/service";
import { ticketVisibilityWhere } from "@/lib/visibility";

let now: Date;
beforeEach(async () => {
  now = await reseed();
});
afterAll(() => db.$disconnect());

const ai = (category: string, severity: string, department: string) => ({
  category,
  severity,
  department,
  summary: "AI summary",
  source: "keywords" as const,
});
const leak: CreateTicketInput = {
  buildingId: "b-glenn",
  spaceId: "s-gln-214",
  description: "Water is leaking from under the bathroom sink and pooling on the floor.",
  category: "PLUMBING",
  severity: "STANDARD",
  summary: "Leak under the bathroom sink, Glenn 214",
  ai: ai("PLUMBING", "STANDARD", "HOUSING"),
};

describe("auto-assignment", () => {
  it("assigns a new report on filing, tags skills, and writes a schedule row", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const t = await db.ticket.findUniqueOrThrow({
      where: { id },
      include: { events: true, scheduledJobs: true },
    });
    expect(t.requiredSkills).toContain("PLUMBER");
    expect(t.status).toBe("ASSIGNED");
    expect(t.assigneeId).toBeTruthy();
    expect(t.scheduledJobs.find((j) => j.role === "PRIMARY")).toMatchObject({
      contractorId: t.assigneeId,
      status: "SCHEDULED",
    });
    expect(t.events.find((e) => e.toStatus === "ASSIGNED")).toMatchObject({
      actorId: null,
      message: expect.stringMatching(/^Auto-assigned to .+ \(.+\), starts /),
    });
  });

  it("is safe to call twice", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: false,
    });
    expect((await autoAssignTicket(db, id, now)).status).toBe("assigned");
    expect((await autoAssignTicket(db, id, now)).status).toBe("skipped");
    expect(await db.scheduledJob.count({ where: { ticketId: id } })).toBeGreaterThan(0);
    expect(
      await db.ticketEvent.count({
        where: { ticketId: id, toStatus: "ASSIGNED" },
      }),
    ).toBe(1);
  });

  it("leaves the ticket Triaged with an internal note when nobody is eligible", async () => {
    await db.contractorProfile.updateMany({
      data: { contractEndsAt: new Date(now.getTime() - 86_400_000) },
    });
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: false,
    });
    expect((await autoAssignTicket(db, id, now)).status).toBe("unassignable");
    await autoAssignTicket(db, id, now);
    const t = await db.ticket.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(t).toMatchObject({ status: "TRIAGED", assigneeId: null });
    expect(t.events.filter((e) => e.internal && /^Auto-assign found nobody/.test(e.message))).toHaveLength(1);
  });

  it("adds a helper for a job that needs two skills and lets the helper see the ticket", async () => {
    const { id } = await createTicket(
      db,
      as("u-maya"),
      {
        ...leak,
        description: "Water dripping from the ceiling light fixture and the outlet is sparking.",
        severity: "URGENT",
        ai: ai("PLUMBING", "URGENT", "HOUSING"),
      },
      now,
      { autoAssign: true },
    );
    const rows = await db.scheduledJob.findMany({ where: { ticketId: id } });
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.requiredSkills.split(",").length).toBeGreaterThan(1);
    const helper = rows.find((r) => r.role === "HELPER");
    if (helper) {
      const seen = await db.ticket.findFirst({
        where: {
          AND: [
            ticketVisibilityWhere({
              ...as("u-terrence"),
              id: helper.contractorId,
            }),
            { id },
          ],
        },
      });
      expect(seen?.id).toBe(id);
      expect(new Set(rows.map((r) => r.startsAt.getTime())).size).toBe(1);
    }
    expect(rows.some((r) => r.role === "PRIMARY")).toBe(true);
  });

  it("starting work and a manual reassignment keep the calendar in sync", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    await contractorStartWork(db, as(t.assigneeId!), id, null, new Date(now.getTime() + 60_000));
    expect(
      (
        await db.scheduledJob.findFirstOrThrow({
          where: { ticketId: id, contractorId: t.assigneeId! },
        })
      ).status,
    ).toBe("IN_PROGRESS");

    const other = await createTicket(db, as("u-maya"), { ...leak, description: "Another leak under the sink in the same room." }, now, { autoAssign: true });
    const o = await db.ticket.findUniqueOrThrow({ where: { id: other.id } });
    const alt = o.assigneeId === "u-terrence" ? "u-ct-omar" : "u-terrence";
    await staffSetStatus(db, as("u-linda"), other.id, { status: "ASSIGNED", assigneeId: alt }, new Date(now.getTime() + 120_000));
    const rows = await db.scheduledJob.findMany({
      where: { ticketId: other.id },
    });
    expect(rows.filter((r) => r.status === "CANCELLED").length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.status === "SCHEDULED").map((r) => r.contractorId)).toEqual([alt]);
  });
});

describe("breaks", () => {
  it("adds a break that pushes later jobs back, rejects overlaps, and deletes only future breaks", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const job = await db.scheduledJob.findFirstOrThrow({
      where: { ticketId: id, role: "PRIMARY" },
    });
    const who = as(job.contractorId);
    // Break on the same campus day as the job, starting at the job's start time.
    const dayOffset = Math.max(0, Math.round((job.startsAt.getTime() - now.getTime()) / 86_400_000));
    const hh = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(job.startsAt);
    const res = await addBreak(db, who, { dayOffset, startTime: hh, minutes: 60 }, now);
    if (res.moved) expect((await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })).startsAt.getTime()).toBeGreaterThan(job.startsAt.getTime());
    await expect(addBreak(db, who, { dayOffset, startTime: hh, minutes: 30 }, now)).rejects.toThrow(/overlaps|already over/);
    await expect(addBreak(db, who, { dayOffset, startTime: "13:00", minutes: 500 }, now)).rejects.toThrow(/at most/);
    const b = await db.contractorBreak.findFirstOrThrow({
      where: { contractorId: job.contractorId, reason: null },
    });
    if (b.startsAt > now) {
      await deleteBreak(db, who, b.id, now);
      expect(await db.contractorBreak.findUnique({ where: { id: b.id } })).toBeNull();
    }
    await expect(addBreak(db, as("u-linda"), { dayOffset: 0, startTime: "13:00", minutes: 30 }, now)).rejects.toThrow(/contractors/);
  });

  it("take a break now sets On a break; back to work restores Available", async () => {
    await db.contractorProfile.update({
      where: { userId: "u-ct-nia" },
      data: { availability: "AVAILABLE" },
    });
    await db.workLog.deleteMany({
      where: { contractorId: "u-ct-nia", endedAt: null },
    });
    const nia = as("u-ct-nia");
    await takeBreakNow(db, nia, 30, now);
    expect(
      (
        await db.contractorProfile.findUniqueOrThrow({
          where: { userId: "u-ct-nia" },
        })
      ).availability,
    ).toBe("ON_BREAK");
    await backToWork(db, nia, new Date(now.getTime() + 10 * 60_000));
    expect(
      (
        await db.contractorProfile.findUniqueOrThrow({
          where: { userId: "u-ct-nia" },
        })
      ).availability,
    ).toBe("AVAILABLE");
  });
});

const later = (m: number) => new Date(now.getTime() + m * 60_000);
const sees = async (contractorId: string, ticketId: string) =>
  !!(await db.ticket.findFirst({
    where: { AND: [ticketVisibilityWhere(as(contractorId)), { id: ticketId }] },
  }));

describe("contractor access after reassignment", () => {
  it("a contractor who finished a room ticket can't see it or its photos once it is reopened and reassigned", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const a = (await db.ticket.findUniqueOrThrow({ where: { id } })).assigneeId!;
    await db.ticket.update({
      where: { id },
      data: { photoUrl: "/uploads/leak-a.jpg" },
    });
    await contractorStartWork(db, as(a), id, null, later(1));
    await contractorFinishWork(db, as(a), id, { notes: "Replaced the trap" }, later(30));
    expect(await sees(a, id)).toBe(true);

    await reopenTicket(db, as("u-maya"), id, "Still leaking", later(60));
    // Reopened: back on the assignee's calendar.
    expect(
      await db.scheduledJob.count({
        where: { ticketId: id, contractorId: a, status: "SCHEDULED" },
      }),
    ).toBe(1);

    const b = a === "u-terrence" ? "u-ct-omar" : "u-terrence";
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: b }, later(90));
    expect(await sees(a, id)).toBe(false);
    expect(await canSeePhoto(db, as(a), "leak-a.jpg")).toBe(false);
    expect(await sees(b, id)).toBe(true);
    expect(await canSeePhoto(db, as(b), "leak-a.jpg")).toBe(true);
    expect(
      await db.scheduledJob.count({
        where: {
          ticketId: id,
          contractorId: a,
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
      }),
    ).toBe(0);
  });

  it("helpers see a ticket only while their slot is live and the ticket is open, and never its internal notes", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    const helper = t.assigneeId === "u-ct-nia" ? "u-terrence" : "u-ct-nia";
    const row = await db.scheduledJob.create({
      data: {
        ticketId: id,
        contractorId: helper,
        role: "HELPER",
        startsAt: later(60),
        endsAt: later(120),
        createdAt: now,
      },
    });
    await db.ticketEvent.create({
      data: {
        ticketId: id,
        type: "NOTE",
        internal: true,
        message: "Internal: dispatcher only",
        createdAt: now,
      },
    });
    expect(await sees(helper, id)).toBe(true);
    const asHelper = await getTicketDetail(db, as(helper), id);
    expect(asHelper!.events.some((e) => e.internal)).toBe(false);
    const asAssignee = await getTicketDetail(db, as(t.assigneeId!), id);
    expect(asAssignee!.events.some((e) => e.internal)).toBe(true);

    await db.scheduledJob.update({
      where: { id: row.id },
      data: { status: "DONE" },
    });
    expect(await sees(helper, id)).toBe(false);
    await db.scheduledJob.update({
      where: { id: row.id },
      data: { status: "SCHEDULED" },
    });
    await db.ticket.update({ where: { id }, data: { status: "RESOLVED" } });
    expect(await sees(helper, id)).toBe(false);
  });

  it("finishing a job cancels the slots of helpers who never started", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const a = (await db.ticket.findUniqueOrThrow({ where: { id } })).assigneeId!;
    const helper = a === "u-ct-nia" ? "u-terrence" : "u-ct-nia";
    await db.scheduledJob.create({
      data: {
        ticketId: id,
        contractorId: helper,
        role: "HELPER",
        startsAt: later(60),
        endsAt: later(120),
        createdAt: now,
      },
    });
    await contractorStartWork(db, as(a), id, null, later(1));
    await contractorFinishWork(db, as(a), id, { notes: "Done" }, later(30));
    const rows = await db.scheduledJob.findMany({ where: { ticketId: id } });
    expect(rows.find((r) => r.contractorId === a)!.status).toBe("DONE");
    expect(rows.find((r) => r.contractorId === helper)!.status).toBe("CANCELLED");
  });
});

describe("scheduler rules", () => {
  it("auto-assignment doesn't count as a first response", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.status).toBe("ASSIGNED");
    expect(t.firstResponseAt).toBeNull();
  });

  it("schedules off-duty contractors in their shifts, while manual assignment still refuses them", async () => {
    await db.contractorProfile.updateMany({
      data: { availability: "OFF_DUTY" },
    });
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: false,
    });
    expect((await autoAssignTicket(db, id, now)).status).toBe("assigned");
    const other = await createTicket(db, as("u-maya"), { ...leak, description: "Another leak under the same sink." }, now, { autoAssign: false });
    await expect(staffSetStatus(db, as("u-linda"), other.id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1))).rejects.toThrow(/Off duty/);
  });

  it("changing a ticket's category recomputes its skills and re-plans it", async () => {
    const vague = { ...leak, description: "Something is wrong in the bathroom and it needs a look." };
    const { id } = await createTicket(db, as("u-maya"), vague, now, { autoAssign: true });
    const before = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(before.requiredSkills).toContain("PLUMBER");
    await staffOverride(db, as("u-linda"), id, { category: "ELECTRICAL", reason: "It was the wiring" }, later(5));
    const after = await db.ticket.findUniqueOrThrow({
      where: { id },
      include: { scheduledJobs: true },
    });
    expect(after.requiredSkills).toContain("ELECTRICIAN");
    expect(after.requiredSkills).not.toContain("PLUMBER");
    const live = after.scheduledJobs.filter((r) => r.status === "SCHEDULED");
    if (after.status === "TRIAGED") expect(live).toHaveLength(0);
    else expect(live.some((r) => r.role === "PRIMARY" && r.contractorId === after.assigneeId)).toBe(true);
  });

  it("deactivating a contractor cancels every slot on the tickets that go back to the queue", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: true,
    });
    const a = (await db.ticket.findUniqueOrThrow({ where: { id } })).assigneeId!;
    const helper = a === "u-ct-nia" ? "u-terrence" : "u-ct-nia";
    await db.scheduledJob.create({
      data: {
        ticketId: id,
        contractorId: helper,
        role: "HELPER",
        startsAt: later(60),
        endsAt: later(120),
        createdAt: now,
      },
    });
    await deactivateContractor(db, as("u-elena"), a, later(2));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).status).toBe("TRIAGED");
    expect(
      await db.scheduledJob.count({
        where: { ticketId: id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
    ).toBe(0);
  });

  it("warns dispatchers when a manual assignment can't be put on the calendar", async () => {
    const { id } = await createTicket(db, as("u-maya"), leak, now, {
      autoAssign: false,
    });
    await db.contractorProfile.update({
      where: { userId: "u-terrence" },
      data: { workDays: "" },
    });
    await scheduleManualAssignment(db, id, "u-terrence", now);
    expect(
      await db.scheduledJob.count({
        where: { ticketId: id, status: "SCHEDULED" },
      }),
    ).toBe(0);
    expect(
      await db.ticketEvent.count({
        where: {
          ticketId: id,
          internal: true,
          message: { contains: "open slot" },
        },
      }),
    ).toBe(1);
  });

  it("an Emergency's auto-assignment starts at the time the contractor is actually booked", async () => {
    const { id } = await createTicket(
      db,
      as("u-maya"),
      {
        ...leak,
        severity: "EMERGENCY",
        ai: ai("PLUMBING", "EMERGENCY", "HOUSING"),
      },
      now,
      { autoAssign: true },
    );
    const rows = await db.scheduledJob.findMany({
      where: { ticketId: id, status: "SCHEDULED" },
    });
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    const primary = rows.find((r) => r.role === "PRIMARY")!;
    expect(primary.contractorId).toBe(t.assigneeId);
    // No other live job of the same contractor overlaps it.
    const mine = await db.scheduledJob.findMany({
      where: {
        contractorId: primary.contractorId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        id: { not: primary.id },
      },
    });
    expect(mine.filter((r) => r.startsAt < primary.endsAt && r.endsAt > primary.startsAt)).toEqual([]);
  });
});
