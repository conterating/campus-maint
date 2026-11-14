import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type Tone = "info" | "success" | "warning" | "danger";

type TicketRef = {
  id: string;
  department: string;
  ownerUserId: string | null;
  assigneeId: string | null;
};

/**
 * Notify the people who care about a ticket: the student owner, every follower,
 * and (optionally) the department — the assignee if there is one, otherwise all
 * of the department's staff. The person who made the change is never notified.
 */
export async function notifyTicket(
  db: Db,
  opts: {
    ticket: TicketRef;
    message: string;
    tone?: Tone;
    actorId?: string | null;
    now: Date;
    includeWatchers?: boolean;
    includeDepartment?: boolean;
    extraUserIds?: string[];
  },
): Promise<string[]> {
  const { ticket, message, tone = "info", actorId, now, includeWatchers = true, includeDepartment = false } = opts;
  const recipients = new Set<string>(opts.extraUserIds ?? []);

  if (includeWatchers) {
    if (ticket.ownerUserId) recipients.add(ticket.ownerUserId);
    const followers = await db.follow.findMany({ where: { ticketId: ticket.id }, select: { userId: true } });
    followers.forEach((f) => recipients.add(f.userId));
  }

  if (includeDepartment) {
    if (ticket.assigneeId) {
      recipients.add(ticket.assigneeId);
    } else {
      const staff = await db.user.findMany({
        where: { role: "STAFF", department: ticket.department },
        select: { id: true },
      });
      staff.forEach((s) => recipients.add(s.id));
    }
  }

  if (actorId) recipients.delete(actorId);
  const ids = [...recipients];
  if (ids.length) {
    await db.notification.createMany({
      data: ids.map((userId) => ({ userId, ticketId: ticket.id, message, tone, createdAt: now })),
    });
  }
  return ids;
}

export async function supervisorIds(db: Db, department: string): Promise<string[]> {
  const sups = await db.user.findMany({
    where: { role: "STAFF", department, isSupervisor: true },
    select: { id: true },
  });
  return sups.map((s) => s.id);
}
