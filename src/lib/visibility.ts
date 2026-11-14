// Visibility rules, enforced in database queries.
//
//   ROOM   tickets: residents of that room, plus staff and admins
//   DORM   tickets: residents of that residence hall, plus staff and admins
//   PUBLIC tickets: everyone
//
// Every query that returns tickets, ticket counts, map points, or duplicate
// matches to a user must AND its filter with `ticketVisibilityWhere(viewer)`.
import type { Prisma } from "@prisma/client";
import type { Role } from "./domain";

export type Viewer = {
  id: string;
  name: string;
  role: Role;
  department: string | null;
  isSupervisor: boolean;
  residenceBuildingId: string | null;
  roomId: string | null;
};

export function isStaff(v: Pick<Viewer, "role">): boolean {
  return v.role === "STAFF" || v.role === "ADMIN";
}

export function ticketVisibilityWhere(viewer: Viewer): Prisma.TicketWhereInput {
  if (isStaff(viewer)) return {};

  const allowed: Prisma.TicketWhereInput[] = [{ scope: "PUBLIC" }];
  if (viewer.residenceBuildingId) {
    allowed.push({ scope: "DORM", buildingId: viewer.residenceBuildingId });
  }
  if (viewer.roomId) {
    allowed.push({ scope: "ROOM", spaceId: viewer.roomId });
  }
  return { OR: allowed };
}

/** Combine a caller's filter with the viewer's visibility filter. */
export function visibleTickets(viewer: Viewer, where: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
  return { AND: [ticketVisibilityWhere(viewer), where] };
}

/** In-memory check for a ticket already loaded (used to guard writes). */
export function canView(
  viewer: Viewer,
  t: { scope: string; buildingId: string; spaceId: string | null },
): boolean {
  if (isStaff(viewer)) return true;
  if (t.scope === "PUBLIC") return true;
  if (t.scope === "DORM") return !!viewer.residenceBuildingId && t.buildingId === viewer.residenceBuildingId;
  if (t.scope === "ROOM") return !!viewer.roomId && t.spaceId === viewer.roomId;
  return false;
}

/**
 * Where a viewer may file a report. Students can report in public buildings,
 * their own hall's shared areas, and their own room. Staff can report anywhere.
 */
export function canReportAt(
  viewer: Viewer,
  loc: { buildingKind: string; buildingId: string; spaceScope: string | null; spaceId: string | null },
): { ok: true } | { ok: false; reason: string } {
  if (isStaff(viewer)) return { ok: true };
  if (loc.buildingKind !== "RESIDENCE") return { ok: true };
  if (viewer.residenceBuildingId !== loc.buildingId) {
    return { ok: false, reason: "You can only report issues in the residence hall you live in." };
  }
  if (loc.spaceScope === "DORM_ROOM" && loc.spaceId !== viewer.roomId) {
    return { ok: false, reason: "You can only report issues inside your own room. Use a shared area instead." };
  }
  return { ok: true };
}
