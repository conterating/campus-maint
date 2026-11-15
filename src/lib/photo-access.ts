import type { PrismaClient } from "@prisma/client";
import { canView, helperSlotWhere, type Viewer } from "./visibility";

/**
 * May this viewer load /uploads/<file>? Only if they can see the ticket the
 * photo belongs to (report photo, comment photo, or completion photo). A photo not yet attached
 * to a ticket (between "analyze" and "submit") isn't tracked to an uploader, so
 * only staff and administrators may read it; the reporter's own preview is
 * rendered from the local file, not this route.
 */
export async function canSeePhoto(db: PrismaClient, viewer: Viewer, file: string): Promise<boolean> {
  const url = `/uploads/${file}`;
  const ticket =
    (await db.ticket.findFirst({ where: { photoUrl: url } })) ??
    (await db.workLog.findFirst({ where: { completionPhotoUrl: url }, include: { ticket: true } }))?.ticket ??
    // Comment photos are stored as a JSON list of URLs on the event.
    (await db.ticketEvent.findFirst({ where: { photos: { contains: `"${url}"` } }, include: { ticket: true } }))?.ticket ??
    null;
  if (ticket) {
    // Helpers with a live slot on an open ticket may see its photos too (same rule as ticketVisibilityWhere).
    const helped =
      viewer.role === "CONTRACTOR" && viewer.id !== "guest"
        ? await db.scheduledJob.findFirst({ where: { ticketId: ticket.id, ...helperSlotWhere(viewer.id) }, select: { id: true } })
        : null;
    return canView(viewer, { ...ticket, helperIds: helped ? [viewer.id] : [] });
  }
  return viewer.id !== "guest" && (viewer.role === "STAFF" || viewer.role === "ADMIN");
}
