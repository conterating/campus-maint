// Ticket lifecycle: creation, ownership, duplicates, me too, staff actions,
// student close-out, and escalation.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, db, reseed } from "../support/db";
import { parseEventPhotos } from "@/lib/domain";
import {
  addComment,
  addMeToo,
  confirmResolution,
  contractorFinishWork,
  contractorStartWork,
  createTicket,
  findDuplicates,
  getTicketDetail,
  reopenTicket,
  runEscalationSweep,
  setFollow,
  staffAddNote,
  staffOverride,
  staffReassign,
  staffSetStatus,
  type CreateTicketInput,
} from "@/lib/tickets";

const H = 3_600_000;
let now: Date;
const later = (h: number) => new Date(now.getTime() + h * H);

beforeEach(async () => {
  now = await reseed();
});
afterAll(() => db.$disconnect());

const ai = (category: string, severity: string, department: string) => ({ category, severity, department, summary: "AI summary", source: "keywords" as const });

const leakInMayasRoom: CreateTicketInput = {
  buildingId: "b-glenn",
  spaceId: "s-gln-214",
  description: "Water is leaking from under the bathroom sink and pooling on the floor.",
  category: "PLUMBING",
  severity: "URGENT",
  summary: "Leak under the bathroom sink, Glenn 214",
  ai: ai("PLUMBING", "URGENT", "HOUSING"),
};

const ticketBySummary = (fragment: string) => db.ticket.findFirstOrThrow({ where: { summary: { contains: fragment } } });

describe("createTicket", () => {
  it("files a dorm-room leak owned by the student, routed to Housing, with a timeline", async () => {
    const { id, number } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: "asc" } } } });
    expect(number).toBeGreaterThan(1000);
    expect(t).toMatchObject({
      scope: "ROOM",
      ownerType: "STUDENT",
      ownerUserId: "u-maya",
      department: "HOUSING",
      status: "TRIAGED",
      severity: "URGENT",
      floor: 2,
    });
    expect(t.responseDueAt.getTime() - now.getTime()).toBe(4 * H);
    expect(t.events.map((e) => e.toStatus)).toEqual(["SUBMITTED", "TRIAGED"]);
    expect(t.events[1].message).toMatch(/Plumbing & leaks · Urgent · routed to Housing Maintenance/);

    // Housing staff hear about it (contractors only once it's assigned to them); nobody outside the room does.
    const notified = (await db.notification.findMany({ where: { ticketId: id } })).map((n) => n.userId).sort();
    expect(notified).toEqual(["u-linda"]);
    expect(await getTicketDetail(db, as("u-jordan"), id)).not.toBeNull();
    expect(await getTicketDetail(db, as("u-ethan"), id)).toBeNull();
  });

  it("makes the department own public issues and auto-follows the reporter", async () => {
    const { id } = await createTicket(
      db,
      as("u-alex"),
      {
        buildingId: "b-culc",
        spaceId: "s-culc-144",
        description: "Projector in 144 flickers off every few minutes",
        category: "AV_TECH",
        severity: "STANDARD",
        summary: "Projector flickers off, CULC 144",
        ai: ai("AV_TECH", "STANDARD", "IT"),
      },
      now,
    );
    const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { followers: true } });
    expect(t).toMatchObject({ scope: "PUBLIC", ownerType: "DEPARTMENT", ownerUserId: null, department: "IT" });
    expect(t.followers.map((f) => f.userId)).toEqual(["u-alex"]);
  });

  it("records the AI's original verdict when the student corrects it", async () => {
    const { id } = await createTicket(db, as("u-maya"), { ...leakInMayasRoom, category: "PLUMBING", severity: "STANDARD", ai: ai("OTHER", "URGENT", "HOUSING") }, now);
    const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { events: true } });
    expect(t).toMatchObject({ aiCategory: "OTHER", aiSeverity: "URGENT", category: "PLUMBING", severity: "STANDARD" });
    expect(t.events.find((e) => e.toStatus === "TRIAGED")!.message).toMatch(/Reporter corrected category Something else → Plumbing & leaks, severity Urgent → Standard/);
  });

  it("re-derives the department from the routing rules, ignoring a tampered value", async () => {
    const { id } = await createTicket(db, as("u-maya"), { ...leakInMayasRoom, ai: ai("PLUMBING", "URGENT", "NOT_A_DEPT") }, now);
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.department).toBe("HOUSING");
    expect(t.aiDepartment).toBe("HOUSING");
  });

  it("keeps safety reports at Emergency even if the form says Low, and alerts the supervisor", async () => {
    const { id } = await createTicket(
      db,
      as("u-maya"),
      { ...leakInMayasRoom, description: "There's a burning smell and smoke coming from the outlet", category: "ELECTRICAL", severity: "LOW" },
      now,
    );
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ severity: "EMERGENCY", safetyFlag: true });
    expect(t.responseDueAt.getTime() - now.getTime()).toBe(1 * H);
    const alerts = await db.notification.findMany({ where: { ticketId: id } });
    expect(alerts.every((n) => n.tone === "danger")).toBe(true);
    expect(alerts.map((n) => n.userId)).toContain("u-linda");
  });

  it("rejects bad input with a message the student can act on", async () => {
    await expect(createTicket(db, as("u-maya"), { ...leakInMayasRoom, description: "leak" }, now)).rejects.toThrow(/few more words/);
    await expect(createTicket(db, as("u-maya"), { ...leakInMayasRoom, category: "NOPE" }, now)).rejects.toThrow(/category/);
    await expect(createTicket(db, as("u-maya"), { ...leakInMayasRoom, buildingId: "b-nowhere" }, now)).rejects.toThrow(/building/);
    await expect(createTicket(db, as("u-maya"), { ...leakInMayasRoom, spaceId: "s-twr-305" }, now)).rejects.toThrow(/isn't in the selected building/);
    await expect(createTicket(db, as("u-maya"), { ...leakInMayasRoom, assetId: "a-klaus-1443" }, now)).rejects.toThrow(/equipment/);
  });

  it("numbers tickets sequentially", async () => {
    const a = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    const b = await createTicket(db, as("u-jordan"), leakInMayasRoom, later(0.1));
    expect(b.number).toBe(a.number + 1);
  });
});

describe("duplicate check", () => {
  it("finds the open library Wi-Fi ticket for a second student", async () => {
    const matches = await findDuplicates(db, as("u-ethan"), {
      buildingId: "b-library",
      spaceId: "s-lib-2study",
      category: "NETWORK",
      description: "wifi keeps disconnecting on the 2nd floor quiet study",
    });
    expect(matches[0]).toMatchObject({ summary: expect.stringMatching(/Wi-Fi dropping/), meTooCount: 5, reportedByViewer: false, viewerMeToo: false });
    expect(matches[0].reasons).toEqual(expect.arrayContaining(["Same room or area", "Same kind of problem", "Similar description"]));
  });

  it("matches on description alone when no room is chosen", async () => {
    const matches = await findDuplicates(db, as("u-ethan"), { buildingId: "b-library", description: "The elevator in the library is out of service" });
    expect(matches[0].summary).toMatch(/Library elevator/);
  });

  it("matches the same equipment from a QR code", async () => {
    const matches = await findDuplicates(db, as("u-maya"), { buildingId: "b-crc", spaceId: "s-crc-cardio", assetId: "a-crc-tm12", description: "makes a noise", category: "FITNESS" });
    expect(matches[0]).toMatchObject({ summary: expect.stringMatching(/Treadmill 12 belt/) });
    expect(matches[0].reasons).toContain("Same equipment");
  });

  it("ignores resolved tickets and unrelated problems", async () => {
    const matches = await findDuplicates(db, as("u-maya"), { buildingId: "b-klaus", spaceId: "s-klaus-atrium", category: "NETWORK", description: "Wi-Fi is slow in the atrium" });
    expect(matches.find((m) => m.summary.includes("Klaus atrium"))).toBeUndefined(); // resolved
    const unrelated = await findDuplicates(db, as("u-maya"), { buildingId: "b-library", spaceId: "s-lib-grp3e", category: "HVAC", description: "Too hot in here" });
    expect(unrelated).toEqual([]);
  });

  it("flags tickets the viewer already reported or me-too'd", async () => {
    const mine = await findDuplicates(db, as("u-alex"), { buildingId: "b-library", spaceId: "s-lib-2study", category: "NETWORK", description: "wifi dropping" });
    expect(mine[0].reportedByViewer).toBe(true);
    const metoo = await findDuplicates(db, as("u-maya"), { buildingId: "b-library", spaceId: "s-lib-2study", category: "NETWORK", description: "wifi dropping" });
    expect(metoo[0].viewerMeToo).toBe(true);
  });
});

describe("me too", () => {
  it("counts the student, follows the ticket, and logs the event", async () => {
    const t = await ticketBySummary("Room 249 projector");
    const res = await addMeToo(db, as("u-ethan"), t.id, now);
    expect(res).toEqual({ meTooCount: 1, raisedTo: null });
    expect(await db.follow.count({ where: { ticketId: t.id, userId: "u-ethan" } })).toBe(1);
    const events = await db.ticketEvent.findMany({ where: { ticketId: t.id, type: "METOO" } });
    expect(events[0].message).toMatch(/^Another student has this problem too \(2 people affected\)$/);
  });

  it(`raises priority one level when the threshold is reached`, async () => {
    const t = await ticketBySummary("Loud projector fan"); // LOW, no me-toos
    await addMeToo(db, as("u-maya"), t.id, now);
    await addMeToo(db, as("u-jordan"), t.id, later(0.1));
    const third = await addMeToo(db, as("u-sam"), t.id, later(0.2));
    expect(third).toEqual({ meTooCount: 3, raisedTo: "STANDARD" });
    const updated = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(updated.severity).toBe("STANDARD");
    expect(updated.responseDueAt.getTime()).toBe(updated.createdAt.getTime() + 48 * H);
    const fourth = await addMeToo(db, as("u-priya"), t.id, later(0.3));
    expect(fourth.raisedTo).toBeNull();
  });

  it("refuses repeats, the reporter, staff, and resolved tickets", async () => {
    const t = await ticketBySummary("Room 249 projector");
    await addMeToo(db, as("u-ethan"), t.id, now);
    await expect(addMeToo(db, as("u-ethan"), t.id, now)).rejects.toThrow(/already/);
    await expect(addMeToo(db, as("u-alex"), t.id, now)).rejects.toThrow(/You reported this/);
    await expect(addMeToo(db, as("u-kevin"), t.id, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const resolved = await db.ticket.findFirstOrThrow({ where: { status: "CONFIRMED", scope: "PUBLIC" } });
    await expect(addMeToo(db, as("u-ethan"), resolved.id, now)).rejects.toThrow(/resolved/);
  });
});

describe("follow", () => {
  it("lets any student who can see a public issue follow and unfollow it", async () => {
    const t = await ticketBySummary("Room 249 projector");
    expect(await setFollow(db, as("u-priya"), t.id, true, now)).toEqual({ following: true });
    expect(await setFollow(db, as("u-priya"), t.id, true, now)).toEqual({ following: true }); // idempotent
    expect(await db.follow.count({ where: { ticketId: t.id, userId: "u-priya" } })).toBe(1);
    expect(await setFollow(db, as("u-priya"), t.id, false, now)).toEqual({ following: false });
    expect(await db.follow.count({ where: { ticketId: t.id, userId: "u-priya" } })).toBe(0);
  });

  it("won't let a student owner unfollow their own room ticket", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await expect(setFollow(db, as("u-maya"), id, false, now)).rejects.toThrow(/own this ticket/);
  });
});

describe("staff actions", () => {
  it("assigning to a contractor records the first response and tells the student and the contractor", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1));
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: "ASSIGNED", assigneeId: "u-terrence" });
    expect(t.firstResponseAt).toEqual(later(1));
    const note = await db.notification.findFirstOrThrow({ where: { ticketId: id, userId: "u-maya" } });
    expect(note.message).toMatch(/A contractor \(Terrence W\.\) is assigned/);
    expect(await db.notification.count({ where: { ticketId: id, userId: "u-terrence", message: { startsWith: "New job" } } })).toBe(1);
  });

  it("the contractor's work log moves it through in progress and resolved, notifying owner and followers", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await setFollow(db, as("u-jordan"), id, true, now);
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1));
    await contractorStartWork(db, as("u-terrence"), id, "Replacing the trap", later(2));
    await contractorFinishWork(db, as("u-terrence"), id, { materials: "P-trap", materialsCost: 18.5, notes: "Replaced the trap" }, later(3));
    const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: "asc" } }, workLogs: true } });
    expect(t.events.map((e) => e.toStatus)).toEqual(["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"]);
    expect(t.events[3].message).toBe("Work started — Replacing the trap");
    expect(t.resolvedAt).toEqual(later(3));
    expect(t.workLogs).toHaveLength(1);
    expect(t.workLogs[0]).toMatchObject({ startedAt: later(2), endedAt: later(3), minutes: 60, roomEnteredAt: later(2), roomExitedAt: later(3), materials: "P-trap", materialsCost: 18.5, laborCost: 52 });
    for (const who of ["u-maya", "u-jordan"]) {
      const msgs = (await db.notification.findMany({ where: { ticketId: id, userId: who } })).map((n) => n.message);
      expect(msgs).toHaveLength(3);
      expect(msgs.some((m) => /Work has started/.test(m))).toBe(true);
      expect(msgs.some((m) => /resolved\. Check it and confirm/.test(m))).toBe(true);
    }
    // The contractor isn't notified about their own changes.
    expect(await db.notification.count({ where: { ticketId: id, userId: "u-terrence", createdAt: { gt: later(1) } } })).toBe(0);
  });

  it("blocks staff from other departments, contractors, and students", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await expect(staffSetStatus(db, as("u-aisha"), id, { status: "ASSIGNED" }, now)).rejects.toThrow(/belongs to Housing Maintenance/);
    await expect(staffSetStatus(db, as("u-maya"), id, { status: "RESOLVED" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staffSetStatus(db, as("u-terrence"), id, { status: "RESOLVED" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-kevin" }, now)).rejects.toThrow(/department/);
    await expect(staffSetStatus(db, as("u-linda"), id, { status: "CONFIRMED" }, now)).rejects.toThrow(/valid status/);
  });

  it("lets the administrator act on any department's tickets", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await staffSetStatus(db, as("u-elena"), id, { status: "IN_PROGRESS" }, later(0.5));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).status).toBe("IN_PROGRESS");
  });

  it("reassigns to another department, which takes over the queue", async () => {
    const { id } = await createTicket(db, as("u-maya"), { ...leakInMayasRoom, description: "Ethernet port in the wall is dead", category: "ELECTRICAL", severity: "STANDARD" }, now);
    await staffReassign(db, as("u-linda"), id, "IT", "Network port, not electrical", later(1));
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ department: "IT", status: "TRIAGED", assigneeId: null });
    const itNotified = await db.notification.findMany({ where: { ticketId: id, userId: { in: ["u-kevin", "u-aisha"] } } });
    expect(itNotified.map((n) => n.userId)).toEqual(["u-aisha"]);
    await expect(staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED" }, later(2))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await staffSetStatus(db, as("u-aisha"), id, { status: "ASSIGNED" }, later(2));
  });

  it("overrides the classification and recomputes the response target", async () => {
    const t = await ticketBySummary("Loud projector fan"); // LOW, awaiting response
    await staffOverride(db, as("u-aisha"), t.id, { severity: "URGENT", category: "AV_TECH", reason: "Exam in this room tomorrow" }, now);
    const u = await db.ticket.findUniqueOrThrow({ where: { id: t.id }, include: { events: { where: { type: "OVERRIDE" } } } });
    expect(u.severity).toBe("URGENT");
    expect(u.aiSeverity).toBe("LOW"); // the AI's verdict is preserved
    expect(u.responseDueAt.getTime()).toBe(u.createdAt.getTime() + 4 * H);
    expect(u.events[0].message).toMatch(/severity Low → Urgent — Exam in this room tomorrow/);
    await expect(staffOverride(db, as("u-aisha"), t.id, { severity: "URGENT" }, now)).rejects.toThrow(/Nothing changed/);
  });

  it("public notes count as a response; internal notes don't and stay hidden", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await staffAddNote(db, as("u-linda"), id, "Parts on order from vendor", true, later(1));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).firstResponseAt).toBeNull();
    expect(await db.notification.count({ where: { ticketId: id, userId: "u-maya" } })).toBe(0);
    await staffAddNote(db, as("u-linda"), id, "We'll be there by 3pm", false, later(2));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).firstResponseAt).toEqual(later(2));
    const studentView = await getTicketDetail(db, as("u-maya"), id);
    expect(studentView!.events.map((e) => e.message)).toContain("We'll be there by 3pm");
    expect(studentView!.events.map((e) => e.message)).not.toContain("Parts on order from vendor");
  });
});

describe("comments", () => {
  const photo = (n: number) => `/uploads/00000000-0000-4000-8000-00000000000${n}.jpg`;
  const sentAt = async (ticketId: string, at: Date) =>
    (await db.notification.findMany({ where: { ticketId, createdAt: at }, orderBy: { userId: "asc" } })).map((n) => ({ userId: n.userId, message: n.message }));

  it("a student comments with photos on a public issue; watchers and the department hear about it", async () => {
    const t = await ticketBySummary("Room 249 projector"); // public, IT, reported by Alex
    // The seeded scheduler dispatches it; this test is about an unassigned ticket (the department hears about it).
    await db.scheduledJob.deleteMany({ where: { ticketId: t.id } });
    await db.ticket.update({ where: { id: t.id }, data: { status: "TRIAGED", assigneeId: null } });
    await setFollow(db, as("u-priya"), t.id, true, now);
    await addComment(db, as("u-ethan"), t.id, { text: "  Still dead this morning, and the HDMI cable is frayed.  ", photoUrls: [photo(1), photo(2)] }, later(1));

    const [event] = await db.ticketEvent.findMany({ where: { ticketId: t.id, type: "COMMENT" } });
    expect(event).toMatchObject({ message: "Still dead this morning, and the HDMI cable is frayed.", actorId: "u-ethan", internal: false });
    expect(parseEventPhotos(event.photos)).toEqual([photo(1), photo(2)]);
    // The commenter follows the ticket now, so they see replies.
    expect(await db.follow.count({ where: { ticketId: t.id, userId: "u-ethan" } })).toBe(1);

    const sent = await sentAt(t.id, later(1));
    expect(sent.map((n) => n.userId)).toEqual(["u-aisha", "u-alex", "u-priya"]); // IT staff, reporter, follower; never Ethan
    expect(sent[0].message).toBe(`New comment on RR-${t.number} (with 2 photos): Still dead this morning, and the HDMI cable is frayed.`);
  });

  it("a comment from the owning department counts as the first response and reaches the student", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await addComment(db, as("u-linda"), id, { text: "Can you send a photo of under the sink?" }, later(1));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).firstResponseAt).toEqual(later(1));
    expect((await sentAt(id, later(1))).map((n) => n.userId)).toEqual(["u-maya"]); // not the rest of Housing
    expect(await db.follow.count({ where: { ticketId: id, userId: "u-linda" } })).toBe(0); // staff don't auto-follow

    // A photo-only reply from the student, which goes back to the department.
    await addComment(db, as("u-maya"), id, { text: "", photoUrls: [photo(3)] }, later(2));
    const reply = await sentAt(id, later(2));
    expect(reply.map((n) => n.userId)).toEqual(["u-linda"]);
    expect(reply[0].message).toBe(`New comment on RR-${(await db.ticket.findUniqueOrThrow({ where: { id } })).number} (with a photo)`);
  });

  it("a comment from another department doesn't count as a response", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await addComment(db, as("u-aisha"), id, { text: "IT here, the router in this room is fine." }, later(1));
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).firstResponseAt).toBeNull();
  });

  it("only people who can see the ticket can comment on it", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await expect(addComment(db, as("u-ethan"), id, { text: "Hello?" }, now)).rejects.toMatchObject({ code: "NOT_FOUND" }); // same hall, other room
    await expect(addComment(db, as("u-alex"), id, { text: "Hello?" }, now)).rejects.toMatchObject({ code: "NOT_FOUND" }); // off campus
    await addComment(db, as("u-jordan"), id, { text: "Roommate here, it's worse tonight." }, now);
    expect(await db.notification.count({ where: { ticketId: id, user: { id: { in: ["u-ethan", "u-alex"] } } } })).toBe(0);
  });

  it("rejects empty comments, long ones, too many photos, and photo URLs that aren't uploads", async () => {
    const t = await ticketBySummary("Room 249 projector");
    await expect(addComment(db, as("u-ethan"), t.id, { text: "   " }, now)).rejects.toThrow(/Write a comment or add a photo/);
    await expect(addComment(db, as("u-ethan"), t.id, { text: "x".repeat(1001) }, now)).rejects.toThrow(/under 1,000 characters/);
    await expect(addComment(db, as("u-ethan"), t.id, { text: "hi", photoUrls: [photo(1), photo(2), photo(3), photo(4)] }, now)).rejects.toThrow(/up to 3 photos/);
    await expect(addComment(db, as("u-ethan"), t.id, { text: "hi", photoUrls: ["https://evil.example/x.jpg"] }, now)).rejects.toThrow(/didn't upload correctly/);
    expect(await db.ticketEvent.count({ where: { ticketId: t.id, type: "COMMENT" } })).toBe(0);
  });

  it("shows comments to everyone who can see the ticket", async () => {
    const t = await ticketBySummary("Room 249 projector");
    await addComment(db, as("u-ethan"), t.id, { text: "Also flickering." }, later(1));
    for (const who of ["u-maya", "u-sam", "u-aisha"]) {
      const view = await getTicketDetail(db, as(who), t.id);
      expect(view!.events.find((e) => e.type === "COMMENT")?.message).toBe("Also flickering.");
    }
  });
});

describe("student close-out", () => {
  async function resolvedLeak() {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await staffSetStatus(db, as("u-linda"), id, { status: "ASSIGNED", assigneeId: "u-terrence" }, later(1));
    await contractorStartWork(db, as("u-terrence"), id, null, later(1.5));
    await contractorFinishWork(db, as("u-terrence"), id, {}, later(2));
    return id;
  }

  it("the reporter confirms a fix", async () => {
    const id = await resolvedLeak();
    await confirmResolution(db, as("u-maya"), id, later(3));
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: "CONFIRMED" });
    expect(t.closedAt).toEqual(later(3));
    expect(await db.notification.count({ where: { ticketId: id, userId: "u-terrence", message: { contains: "confirmed" } } })).toBe(1);
  });

  it("the reporter reopens a fix that didn't hold, restarting the response clock", async () => {
    const id = await resolvedLeak();
    await reopenTicket(db, as("u-maya"), id, "Still dripping", later(5));
    const t = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: "REOPENED", firstResponseAt: null, resolvedAt: null, escalatedAt: null });
    expect(t.responseDueAt).toEqual(later(5 + 4));
  });

  it("only the reporter can close out, and only once resolved", async () => {
    const { id } = await createTicket(db, as("u-maya"), leakInMayasRoom, now);
    await expect(confirmResolution(db, as("u-maya"), id, now)).rejects.toThrow(/once staff mark this resolved/);
    const resolvedId = await resolvedLeak();
    await expect(confirmResolution(db, as("u-jordan"), resolvedId, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reopenTicket(db, as("u-maya"), resolvedId, "", now)).rejects.toThrow(/what's still wrong/);
  });
});

describe("escalation", () => {
  it("escalates the Skiles projector once its 4-hour target passes, and only once", async () => {
    const t = await ticketBySummary("Room 249 projector");
    expect(t.escalatedAt).toBeNull();
    expect(t.responseDueAt.getTime() - now.getTime()).toBeCloseTo(0.75 * H, -4);

    expect(await runEscalationSweep(db, later(0.5))).toBe(0);
    expect(await runEscalationSweep(db, later(1))).toBe(1);
    expect(await runEscalationSweep(db, later(2))).toBe(0);

    const u = await db.ticket.findUniqueOrThrow({ where: { id: t.id }, include: { events: { where: { type: "ESCALATED" } } } });
    expect(u.escalatedAt).toEqual(later(1));
    expect(u.events).toHaveLength(1);
    expect(u.events[0].message).toMatch(/4-hour target\. Escalated to the IT supervisor \(Aisha R\.\)/);

    const supervisorAlert = await db.notification.findFirstOrThrow({ where: { ticketId: t.id, userId: "u-aisha", tone: "danger" } });
    expect(supervisorAlert.message).toMatch(/missed its 4h response target/);
    const reporterNote = await db.notification.findFirstOrThrow({ where: { ticketId: t.id, userId: "u-alex", message: { contains: "escalated" } } });
    expect(reporterNote.message).toMatch(/escalated to the IT supervisor/);
  });

  it("doesn't escalate tickets that got a response in time", async () => {
    const t = await ticketBySummary("Room 249 projector");
    await staffSetStatus(db, as("u-aisha"), t.id, { status: "ASSIGNED", assigneeId: "u-kevin" }, later(0.5));
    await runEscalationSweep(db, later(10));
    const u = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(u.escalatedAt).toBeNull();
    expect(await db.ticketEvent.count({ where: { ticketId: t.id, type: "ESCALATED" } })).toBe(0);
  });

  it("seeded overdue tickets are already escalated", async () => {
    const overdue = await db.ticket.findMany({ where: { firstResponseAt: null, status: { in: ["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "REOPENED"] }, responseDueAt: { lt: now } } });
    expect(overdue.length).toBeGreaterThanOrEqual(3);
    expect(overdue.every((t) => t.escalatedAt !== null)).toBe(true);
  });
});

describe("duplicate check across rooms", () => {
  it("doesn't treat a leak in a dorm room as the shared bathroom's shower ticket", async () => {
    const matches = await findDuplicates(db, as("u-maya"), {
      buildingId: "b-glenn",
      spaceId: "s-gln-214",
      category: "PLUMBING",
      description: "Water is leaking from under the bathroom sink and pooling on the floor.",
    });
    expect(matches.find((m) => m.summary.includes("Two showers"))).toBeUndefined();
  });

  it("still matches across rooms when the reports clearly describe the same thing", async () => {
    const matches = await findDuplicates(db, as("u-jordan"), {
      buildingId: "b-glenn",
      spaceId: "s-gln-2hall",
      category: "PLUMBING",
      description: "Two of the shower heads in the 2nd floor bathroom have no water pressure",
    });
    expect(matches[0]?.summary).toMatch(/Two showers with no pressure/);
  });
});
