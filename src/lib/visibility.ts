// Visibility rules, enforced in database queries.
//
//   ROOM   tickets: residents of that room, plus staff and admins
//   DORM   tickets: residents of that residence hall, plus staff and admins
//   PUBLIC tickets: every student, staff member and admin
//   Students also always see the tickets they reported.
//   CONTRACTORS see only the tickets assigned to them, or open tickets they hold a live
//   (scheduled or in-progress) slot on as a helper. Finished or cancelled slots grant nothing.
//
// A student whose residence isn't verified yet gets a Viewer with no hall or
// room (see getViewer), so they see public tickets plus their own reports.
//
// Every query that returns tickets, ticket counts, map points, or duplicate
// matches to a user must AND its filter with `ticketVisibilityWhere(viewer)`.
import type { Prisma } from "@prisma/client";
import { OPEN_STATUSES, type Role } from "./domain";

export type StaffPermissions = {
  canManageUsers: boolean;
  canManageContractors: boolean;
  canVerifyResidence: boolean;
  canViewAnalytics: boolean;
  canAssignWork: boolean;
};

export type Viewer = {
  id: string;
  name: string;
  role: Role;
  department: string | null;
  isSupervisor: boolean;
  residenceBuildingId: string | null;
  roomId: string | null;
  /** Staff permission flags (ADMIN gets all of them). Missing = defaults. */
  permissions?: StaffPermissions;
  /** False while Housing confirms a student's room (hall/room are then null above). */
  residenceVerified?: boolean;
  /** Set when an admin is viewing as this user in demo mode. */
  impersonator?: { id: string; name: string } | null;
};

export const ALL_PERMISSIONS: StaffPermissions = {
  canManageUsers: true,
  canManageContractors: true,
  canVerifyResidence: true,
  canViewAnalytics: true,
  canAssignWork: true,
};
export const NO_PERMISSIONS: StaffPermissions = {
  canManageUsers: false,
  canManageContractors: false,
  canVerifyResidence: false,
  canViewAnalytics: false,
  canAssignWork: false,
};

/** STAFF or ADMIN. Contractors are not staff. */
export function isStaff(v: Pick<Viewer, "role">): boolean {
  return v.role === "STAFF" || v.role === "ADMIN";
}

/** Effective permission for a viewer: ADMIN has all; STAFF use their profile (assigning defaults on). */
export function can(v: Pick<Viewer, "role" | "permissions">, perm: keyof StaffPermissions): boolean {
  if (v.role === "ADMIN") return true;
  if (v.role !== "STAFF") return false;
  if (!v.permissions) return perm === "canAssignWork";
  return v.permissions[perm];
}

/** Schedule-row statuses that still give a helper access to a ticket. */
export const LIVE_SLOT_STATUSES = ["SCHEDULED", "IN_PROGRESS"];

/** A live slot for this contractor on an open ticket (the only way a non-assignee contractor sees a ticket). */
export function helperSlotWhere(contractorId: string): Prisma.ScheduledJobWhereInput {
  return { contractorId, status: { in: LIVE_SLOT_STATUSES }, ticket: { status: { in: [...OPEN_STATUSES] } } };
}

export function ticketVisibilityWhere(viewer: Viewer): Prisma.TicketWhereInput {
  if (isStaff(viewer)) return {};
  if (viewer.role === "CONTRACTOR") {
    return { OR: [{ assigneeId: viewer.id }, { status: { in: [...OPEN_STATUSES] }, scheduledJobs: { some: { contractorId: viewer.id, status: { in: LIVE_SLOT_STATUSES } } } }] };
  }
  if (viewer.role !== "STUDENT") return { id: "__nobody__" };

  const allowed: Prisma.TicketWhereInput[] = [{ scope: "PUBLIC" }, { reporterId: viewer.id }];
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
  t: { scope: string; buildingId: string; spaceId: string | null; reporterId: string; assigneeId: string | null; helperIds?: string[] },
): boolean {
  if (isStaff(viewer)) return true;
  if (viewer.role === "CONTRACTOR") return t.assigneeId === viewer.id || !!t.helperIds?.includes(viewer.id);
  if (viewer.role !== "STUDENT") return false;
  if (t.reporterId === viewer.id) return true;
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
  if (viewer.role !== "STUDENT") {
    return { ok: false, reason: "Contractors can't file reports. Tell the department dispatcher about the problem instead." };
  }
  if (loc.buildingKind !== "RESIDENCE") return { ok: true };
  if (viewer.residenceVerified === false) {
    return { ok: false, reason: "Housing is confirming your room. Until then you can report issues in public buildings." };
  }
  if (viewer.residenceBuildingId !== loc.buildingId) {
    return { ok: false, reason: "You can only report issues in the residence hall you live in." };
  }
  if (loc.spaceScope === "DORM_ROOM" && loc.spaceId !== viewer.roomId) {
    return { ok: false, reason: "You can only report issues inside your own room. Use a shared area instead." };
  }
  return { ok: true };
}
