import type { PrismaClient } from "@prisma/client";
import { canView, type Viewer } from "./visibility";

/**
 * May this viewer load /uploads/<file>? Only if they can see the ticket the
 * photo belongs to (report photo, comment photo, or completion photo). A photo not yet attached
 * to a ticket (between "analyze" and "submit") has an unguessable name and is
 * only known to whoever uploaded it; contractors never get unattached photos.
 */
export async function canSeePhoto(db: PrismaClient, viewer: Viewer, file: string): Promise<boolean> {
  const url = `/uploads/${file}`;
  const ticket =
    (await db.ticket.findFirst({ where: { photoUrl: url } })) ??
    (await db.workLog.findFirst({ where: { completionPhotoUrl: url }, include: { ticket: true } }))?.ticket ??
    // Comment photos are stored as a JSON list of URLs on the event.
    (await db.ticketEvent.findFirst({ where: { photos: { contains: `"${url}"` } }, include: { ticket: true } }))?.ticket ??
    null;
  if (ticket) return canView(viewer, ticket);
  return viewer.role !== "CONTRACTOR" && viewer.id !== "guest";
}
