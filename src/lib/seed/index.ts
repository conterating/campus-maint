// Builds the demo database. Tickets are replayed in time order through the same
// service functions the app uses (create, me too, staff updates, escalation), so
// seeded data obeys exactly the same rules as live data.
import type { PrismaClient } from "@prisma/client";
import { routeTicket } from "@/config/routing";
import { locationTypeFor, type Role } from "@/lib/domain";
import {
  addMeToo,
  confirmResolution,
  createTicket,
  reopenTicket,
  runEscalationSweep,
  staffAddNote,
  staffOverride,
  staffReassign,
  staffSetStatus,
} from "@/lib/tickets";
import type { Viewer } from "@/lib/visibility";
import { ASSETS, BUILDINGS, SPACES, TICKETS, USERS, type Step, type TicketSeed } from "./data";

const HOUR = 3_600_000;

export async function wipeDatabase(db: PrismaClient) {
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

export async function seedReferenceData(db: PrismaClient) {
  await db.building.createMany({ data: BUILDINGS });
  await db.space.createMany({ data: SPACES });
  await db.asset.createMany({ data: ASSETS });
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
    })),
  });
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
  };
}

function technicianFor(department: string): Viewer {
  const tech = USERS.find((u) => u.role === "STAFF" && u.department === department && !u.isSupervisor);
  if (!tech) throw new Error(`No technician for ${department}`);
  return viewerFromSeed(tech.id);
}

type Op = { at: number; order: number; run: () => Promise<void> };

export async function seedDatabase(db: PrismaClient, opts: { now?: Date; quiet?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  await wipeDatabase(db);
  await seedReferenceData(db);

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

async function runStep(db: PrismaClient, ref: { id: string; reporter: Viewer }, step: Step, at: Date) {
  const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ref.id } });
  const tech = technicianFor(ticket.department);
  switch (step.do) {
    case "assign":
      await staffSetStatus(db, tech, ref.id, { status: "ASSIGNED", assigneeId: tech.id, note: step.note }, at);
      break;
    case "start":
      await staffSetStatus(db, tech, ref.id, { status: "IN_PROGRESS", note: step.note }, at);
      break;
    case "resolve":
      await staffSetStatus(db, tech, ref.id, { status: "RESOLVED", note: step.note }, at);
      break;
    case "note":
      await staffAddNote(db, tech, ref.id, step.text, step.internal ?? false, at);
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
      await staffReassign(db, tech, ref.id, step.dept, step.reason, at);
      break;
    case "override":
      await staffOverride(db, tech, ref.id, { severity: step.sev, category: step.cat, reason: step.reason }, at);
      break;
  }
}
