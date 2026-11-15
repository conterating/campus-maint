// Visibility rules, tested against the real seeded database through the same
// query helpers the pages use.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, db, reseed } from "../support/db";
import {
  addMeToo,
  createTicket,
  findDuplicates,
  getTicketDetail,
  getVisibleTicketOrThrow,
  listMyTickets,
  listVisibleTickets,
  setFollow,
} from "@/lib/tickets";
import { canView, visibleTickets } from "@/lib/visibility";
import { AppError } from "@/lib/errors";
import { USERS } from "@/lib/seed/data";

let now: Date;
beforeAll(async () => {
  now = await reseed();
});
afterAll(() => db.$disconnect());

const byScope = async (viewerId: string) => {
  const tickets = await listVisibleTickets(db, as(viewerId));
  return {
    tickets,
    rooms: new Set(tickets.filter((t) => t.scope === "ROOM").map((t) => t.spaceId)),
    dorms: new Set(tickets.filter((t) => t.scope === "DORM").map((t) => t.buildingId)),
    publicCount: tickets.filter((t) => t.scope === "PUBLIC").length,
  };
};

describe("seed sanity", () => {
  it("has tickets in every scope across several halls", async () => {
    const all = await db.ticket.findMany();
    expect(all.length).toBeGreaterThanOrEqual(40);
    expect(new Set(all.map((t) => t.scope))).toEqual(new Set(["ROOM", "DORM", "PUBLIC"]));
    expect(new Set(all.filter((t) => t.scope !== "PUBLIC").map((t) => t.buildingId)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("dorm room issues", () => {
  it("are visible to residents of that room", async () => {
    const maya = await byScope("u-maya");
    const jordan = await byScope("u-jordan"); // Maya's roommate
    expect([...maya.rooms]).toEqual(["s-gln-214"]);
    expect([...jordan.rooms]).toEqual(["s-gln-214"]);
  });

  it("are hidden from other residents of the same hall", async () => {
    const ethan = await byScope("u-ethan"); // Glenn 309
    expect(ethan.rooms.has("s-gln-214")).toBe(false);
    const roomTicket = await db.ticket.findFirstOrThrow({ where: { spaceId: "s-gln-214" } });
    expect(await getTicketDetail(db, as("u-ethan"), roomTicket.id)).toBeNull();
  });

  it("are visible to all staff and the administrator", async () => {
    const roomTickets = await db.ticket.count({ where: { scope: "ROOM" } });
    for (const id of ["u-linda", "u-aisha", "u-henry", "u-elena"]) {
      const v = await listVisibleTickets(db, as(id), { scope: "ROOM" });
      expect(v.length).toBe(roomTickets);
    }
  });
});

describe("dorm shared-area issues", () => {
  it("are visible to every resident of that hall, and only that hall", async () => {
    expect([...(await byScope("u-maya")).dorms]).toEqual(["b-glenn"]);
    expect([...(await byScope("u-ethan")).dorms]).toEqual(["b-glenn"]);
    expect([...(await byScope("u-sam")).dorms]).toEqual(["b-towers"]);
    expect([...(await byScope("u-priya")).dorms]).toEqual(["b-nae"]);
  });
});

describe("students who don't live in a dorm", () => {
  it("see nothing from it: no tickets, no counts, no map points", async () => {
    const alex = await byScope("u-alex"); // off campus
    expect(alex.rooms.size).toBe(0);
    expect(alex.dorms.size).toBe(0);
    expect(alex.tickets.every((t) => t.scope === "PUBLIC")).toBe(true);
    expect(alex.tickets.some((t) => t.building.kind === "RESIDENCE")).toBe(false);

    // Counting through the visibility filter yields zero for a dorm, as the map/heat layer does.
    expect(await db.ticket.count({ where: visibleTickets(as("u-alex"), { buildingId: "b-glenn" }) })).toBe(0);
    expect(await db.ticket.count({ where: visibleTickets(as("u-sam"), { buildingId: "b-glenn" }) })).toBe(0);
    expect(await db.ticket.count({ where: visibleTickets(as("u-maya"), { buildingId: "b-glenn" }) })).toBeGreaterThan(0);
  });

  it("get no duplicate matches from another hall, even with identical text", async () => {
    const glennTicket = await db.ticket.findFirstOrThrow({ where: { buildingId: "b-glenn", scope: "DORM", status: { in: ["TRIAGED", "ASSIGNED", "IN_PROGRESS"] } } });
    const query = { buildingId: "b-glenn", category: glennTicket.category, description: glennTicket.description, spaceId: glennTicket.spaceId };
    expect(await findDuplicates(db, as("u-alex"), query)).toEqual([]);
    expect(await findDuplicates(db, as("u-sam"), query)).toEqual([]);
    const forResident = await findDuplicates(db, as("u-maya"), query);
    expect(forResident.map((d) => d.id)).toContain(glennTicket.id);
  });

  it("cannot read, follow, or me-too a hidden ticket by id", async () => {
    const hidden = await db.ticket.findFirstOrThrow({ where: { scope: "DORM", buildingId: "b-glenn", status: "TRIAGED" } });
    await expect(getVisibleTicketOrThrow(db, as("u-alex"), hidden.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setFollow(db, as("u-alex"), hidden.id, true, now)).rejects.toBeInstanceOf(AppError);
    await expect(addMeToo(db, as("u-sam"), hidden.id, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.follow.count({ where: { ticketId: hidden.id, userId: "u-alex" } })).toBe(0);
  });

  it("cannot file a report inside a hall they don't live in", async () => {
    const input = {
      buildingId: "b-glenn",
      spaceId: "s-gln-2bath",
      description: "Sink is clogged in the bathroom",
      category: "PLUMBING",
      severity: "STANDARD",
      summary: "Clogged sink",
      ai: { category: "PLUMBING", severity: "STANDARD", department: "HOUSING", summary: "Clogged sink", source: "keywords" as const },
    };
    await expect(createTicket(db, as("u-alex"), input, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTicket(db, as("u-sam"), input, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTicket(db, as("u-ethan"), { ...input, spaceId: "s-gln-214" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("public building issues", () => {
  it("are visible to every student and staff member", async () => {
    const publicCount = await db.ticket.count({ where: { scope: "PUBLIC" } });
    for (const u of USERS.filter((x) => x.role !== "CONTRACTOR")) {
      expect(await db.ticket.count({ where: visibleTickets(as(u.id), { scope: "PUBLIC" }) })).toBe(publicCount);
    }
  });
});

describe("cross-cutting invariants", () => {
  it("the database filter and the in-memory check agree for every user and ticket", async () => {
    const all = await db.ticket.findMany({ select: { id: true, scope: true, buildingId: true, spaceId: true, reporterId: true, assigneeId: true } });
    expect(new Set(USERS.map((u) => u.role))).toEqual(new Set(["STUDENT", "CONTRACTOR", "STAFF", "ADMIN"]));
    for (const u of USERS) {
      const viewer = as(u.id);
      const visible = new Set((await db.ticket.findMany({ where: visibleTickets(viewer), select: { id: true } })).map((t) => t.id));
      for (const t of all) expect(visible.has(t.id), `${u.id} / ${t.id}`).toBe(canView(viewer, t));
    }
  });

  it("no notification was ever sent to someone who can't see its ticket", async () => {
    const notes = await db.notification.findMany({ include: { ticket: true, user: true } });
    expect(notes.length).toBeGreaterThan(20);
    for (const n of notes) {
      if (!n.ticket) continue;
      expect(canView(as(n.userId), n.ticket), `${n.userId} notified about ${n.ticket.number}`).toBe(true);
    }
  });

  it("no follower or me-too exists from someone who can't see the ticket", async () => {
    const follows = await db.follow.findMany({ include: { ticket: true } });
    const meToos = await db.meToo.findMany({ include: { ticket: true } });
    for (const f of [...follows, ...meToos]) expect(canView(as(f.userId), f.ticket)).toBe(true);
  });

  it("'My issues' never includes a ticket the viewer can't see", async () => {
    for (const u of USERS) {
      const mine = await listMyTickets(db, as(u.id));
      for (const t of mine) expect(canView(as(u.id), t)).toBe(true);
    }
  });

  it("students never see internal staff notes on a ticket", async () => {
    const t = await db.ticket.findFirstOrThrow({ where: { scope: "PUBLIC", status: "IN_PROGRESS" } });
    await db.ticketEvent.create({ data: { ticketId: t.id, type: "NOTE", message: "INTERNAL: vendor quote $2,400", internal: true, actorId: "u-rosa", createdAt: now } });
    const studentView = await getTicketDetail(db, as("u-alex"), t.id);
    const staffView = await getTicketDetail(db, as("u-rosa"), t.id);
    expect(studentView!.events.some((e) => e.message.includes("INTERNAL"))).toBe(false);
    expect(staffView!.events.some((e) => e.message.includes("INTERNAL"))).toBe(true);
  });

  it("contractors see only the tickets assigned to them, with the room details", async () => {
    for (const u of USERS.filter((x) => x.role === "CONTRACTOR")) {
      const visible = await listVisibleTickets(db, as(u.id));
      const assigned = await db.ticket.count({ where: { assigneeId: u.id } });
      expect(visible.length, u.id).toBe(assigned);
      expect(visible.every((t) => t.assigneeId === u.id)).toBe(true);
    }
    const roomJob = await db.ticket.findFirstOrThrow({ where: { scope: "ROOM", assigneeId: "u-terrence" } });
    const detail = await getTicketDetail(db, as("u-terrence"), roomJob.id);
    expect(detail?.space?.label).toBeTruthy();
    const notMine = await db.ticket.findFirstOrThrow({ where: { assigneeId: { not: "u-terrence" } } });
    expect(await getTicketDetail(db, as("u-terrence"), notMine.id)).toBeNull();
  });
});

describe("unverified residences", () => {
  it("see only public tickets plus their own reports", async () => {
    // Maya's room isn't confirmed: getViewer() drops her hall and room.
    const unverified = { ...as("u-maya"), residenceVerified: false, residenceBuildingId: null, roomId: null };
    const visible = await listVisibleTickets(db, unverified);
    expect(visible.length).toBeGreaterThan(0);
    for (const t of visible) expect(t.scope === "PUBLIC" || t.reporterId === "u-maya", t.id).toBe(true);
    const own = await db.ticket.count({ where: { reporterId: "u-maya" } });
    expect(visible.filter((t) => t.reporterId === "u-maya").length).toBe(own);
    const roommateReport = await db.ticket.findFirstOrThrow({ where: { scope: "ROOM", spaceId: "s-gln-214", reporterId: { not: "u-maya" } } }).catch(() => null);
    if (roommateReport) expect(await getTicketDetail(db, unverified, roommateReport.id)).toBeNull();
  });
});
