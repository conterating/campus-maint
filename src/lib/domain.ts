// Shared vocabulary for Ramblin’ Repairs. Pure module: safe to import from client and server.

export const SEVERITIES = ["EMERGENCY", "URGENT", "STANDARD", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  EMERGENCY: "Emergency",
  URGENT: "Urgent",
  STANDARD: "Standard",
  LOW: "Low",
};

/** Higher number = more severe. */
export const SEVERITY_RANK: Record<Severity, number> = {
  EMERGENCY: 4,
  URGENT: 3,
  STANDARD: 2,
  LOW: 1,
};

export const STATUSES = [
  "SUBMITTED",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CONFIRMED",
  "REOPENED",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  SUBMITTED: "Submitted",
  TRIAGED: "Triaged",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CONFIRMED: "Confirmed",
  REOPENED: "Reopened",
};

/** Statuses where the work is still outstanding. */
export const OPEN_STATUSES: Status[] = ["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
export const CLOSED_STATUSES: Status[] = ["RESOLVED", "CONFIRMED"];

export function isOpenStatus(s: string): boolean {
  return (OPEN_STATUSES as string[]).includes(s);
}

/** The happy-path order shown on the ticket timeline. */
export const TIMELINE_STEPS: Status[] = ["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CONFIRMED"];

/** Statuses staff may set from the dashboard. Confirm/reopen belong to the student. */
export const STAFF_SETTABLE_STATUSES: Status[] = ["TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"];

export const CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "ELEVATOR",
  "APPLIANCE",
  "NETWORK",
  "AV_TECH",
  "FURNITURE",
  "DOORS_LOCKS",
  "CLEANING",
  "FOOD_SERVICE",
  "FITNESS",
  "STRUCTURAL",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  PLUMBING: "Plumbing & leaks",
  ELECTRICAL: "Electrical & lighting",
  HVAC: "Heating & cooling",
  ELEVATOR: "Elevator",
  APPLIANCE: "Laundry & appliances",
  NETWORK: "Wi-Fi & network",
  AV_TECH: "Classroom & AV tech",
  FURNITURE: "Furniture & fixtures",
  DOORS_LOCKS: "Doors, windows & locks",
  CLEANING: "Cleaning & pests",
  FOOD_SERVICE: "Dining equipment",
  FITNESS: "Fitness equipment",
  STRUCTURAL: "Walls, floors & ceilings",
  OTHER: "Something else",
};

export const DEPARTMENTS = ["HOUSING", "FACILITIES", "IT", "DINING", "LIBRARY", "RECREATION"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  HOUSING: "Housing Maintenance",
  FACILITIES: "Facilities",
  IT: "IT",
  DINING: "Dining",
  LIBRARY: "Library",
  RECREATION: "Campus Recreation",
};

export const BUILDING_KINDS = ["RESIDENCE", "LIBRARY", "DINING", "STUDENT_CENTER", "RECREATION", "ACADEMIC"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const BUILDING_KIND_LABEL: Record<BuildingKind, string> = {
  RESIDENCE: "Residence hall",
  LIBRARY: "Library",
  DINING: "Dining hall",
  STUDENT_CENTER: "Student center",
  RECREATION: "Recreation",
  ACADEMIC: "Classroom building",
};

export const HOUSING_AREAS = ["EAST", "NORTH_AVE", "WEST", "GRAD"] as const;
export type HousingArea = (typeof HOUSING_AREAS)[number];

export const HOUSING_AREA_LABEL: Record<HousingArea, string> = {
  EAST: "East Campus",
  NORTH_AVE: "North Avenue",
  WEST: "West Campus",
  GRAD: "Graduate housing",
};

/** Option groups for building pickers, in the order people look for them. */
export function buildingGroupLabel(b: { kind: string; area?: string | null }): string {
  if (b.kind === "RESIDENCE") {
    const area = HOUSING_AREA_LABEL[b.area as HousingArea];
    return area ? `Residence halls · ${area}` : "Residence halls";
  }
  if (b.kind === "ACADEMIC") return "Classrooms & labs";
  if (b.kind === "DINING") return "Dining";
  return "Libraries, student center & recreation";
}

export const BUILDING_GROUP_ORDER = [
  "Classrooms & labs",
  "Libraries, student center & recreation",
  "Dining",
  ...HOUSING_AREAS.map((a) => `Residence halls · ${HOUSING_AREA_LABEL[a]}`),
  "Residence halls",
];

/** How a Space relates to visibility. */
export type SpaceScope = "DORM_ROOM" | "DORM_SHARED" | "PUBLIC";

/** Who can see a ticket. */
export type TicketScope = "ROOM" | "DORM" | "PUBLIC";

/** The location type used by routing rules. */
export const LOCATION_TYPES = [
  "DORM_ROOM",
  "DORM_SHARED",
  "ACADEMIC",
  "LIBRARY",
  "DINING",
  "STUDENT_CENTER",
  "RECREATION",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  DORM_ROOM: "Dorm room",
  DORM_SHARED: "Dorm shared area",
  ACADEMIC: "Classroom building",
  LIBRARY: "Library",
  DINING: "Dining hall",
  STUDENT_CENTER: "Student center",
  RECREATION: "Recreation center",
};

export type Role = "STUDENT" | "STAFF" | "ADMIN";

export function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}
export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}
export function isDepartment(v: unknown): v is Department {
  return typeof v === "string" && (DEPARTMENTS as readonly string[]).includes(v);
}
export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/**
 * Derive the routing location type from the building kind and the space scope.
 * Residence halls without a specific space count as shared areas.
 */
export function locationTypeFor(buildingKind: string, spaceScope?: string | null): LocationType {
  if (buildingKind === "RESIDENCE") {
    return spaceScope === "DORM_ROOM" ? "DORM_ROOM" : "DORM_SHARED";
  }
  switch (buildingKind) {
    case "LIBRARY":
      return "LIBRARY";
    case "DINING":
      return "DINING";
    case "STUDENT_CENTER":
      return "STUDENT_CENTER";
    case "RECREATION":
      return "RECREATION";
    default:
      return "ACADEMIC";
  }
}

/** Derive who may see a ticket from where it is. */
export function ticketScopeFor(buildingKind: string, spaceScope?: string | null): TicketScope {
  const lt = locationTypeFor(buildingKind, spaceScope);
  if (lt === "DORM_ROOM") return "ROOM";
  if (lt === "DORM_SHARED") return "DORM";
  return "PUBLIC";
}

export function formatTicketNumber(n: number): string {
  return `RR-${n}`;
}
