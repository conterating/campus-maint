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

export const ROLES = ["STUDENT", "CONTRACTOR", "STAFF", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  CONTRACTOR: "Contractor",
  STAFF: "Staff",
  ADMIN: "Administrator",
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Account fields (SQLite has no enums; these are the allowed column values)
// ---------------------------------------------------------------------------

export const GENDERS = ["WOMAN", "MAN", "NONBINARY", "SELF_DESCRIBE", "PREFER_NOT_TO_SAY"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = {
  WOMAN: "Woman",
  MAN: "Man",
  NONBINARY: "Non-binary",
  SELF_DESCRIBE: "Self-describe",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};
export function isGender(v: unknown): v is Gender {
  return typeof v === "string" && (GENDERS as readonly string[]).includes(v);
}

export const STUDENT_YEARS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH_PLUS", "GRADUATE"] as const;
export type StudentYear = (typeof STUDENT_YEARS)[number];
export const STUDENT_YEAR_LABEL: Record<StudentYear, string> = {
  FIRST: "1st year",
  SECOND: "2nd year",
  THIRD: "3rd year",
  FOURTH: "4th year",
  FIFTH_PLUS: "5th year or more",
  GRADUATE: "Graduate",
};
export function isStudentYear(v: unknown): v is StudentYear {
  return typeof v === "string" && (STUDENT_YEARS as readonly string[]).includes(v);
}

export const BACKGROUND_CHECK_STATUSES = ["PENDING", "CLEARED", "EXPIRED"] as const;
export type BackgroundCheckStatus = (typeof BACKGROUND_CHECK_STATUSES)[number];
export const BACKGROUND_CHECK_LABEL: Record<BackgroundCheckStatus, string> = {
  PENDING: "Pending",
  CLEARED: "Cleared",
  EXPIRED: "Expired",
};
export function isBackgroundCheckStatus(v: unknown): v is BackgroundCheckStatus {
  return typeof v === "string" && (BACKGROUND_CHECK_STATUSES as readonly string[]).includes(v);
}

export const AVAILABILITIES = ["AVAILABLE", "ON_JOB", "OFF_DUTY"] as const;
export type Availability = (typeof AVAILABILITIES)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  AVAILABLE: "Available",
  ON_JOB: "On a job",
  OFF_DUTY: "Off duty",
};
export function isAvailability(v: unknown): v is Availability {
  return typeof v === "string" && (AVAILABILITIES as readonly string[]).includes(v);
}

export const AUDIT_ACTIONS = [
  "ACCOUNT_CREATED",
  "ACCOUNT_UPDATED",
  "ROLE_CHANGED",
  "PERMISSIONS_CHANGED",
  "RESIDENCE_VERIFIED",
  "RESIDENCE_REJECTED",
  "RESIDENCE_EDITED",
  "ACCOUNT_DISABLED",
  "ACCOUNT_ENABLED",
  "CONTRACTOR_CREATED",
  "CONTRACTOR_UPDATED",
  "CONTRACTOR_DEACTIVATED",
  "INVITE_SENT",
  "PASSWORD_RESET_SENT",
  "IMPERSONATION_STARTED",
  "IMPERSONATION_STOPPED",
  "DEMO_RESET",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  ACCOUNT_CREATED: "Account created",
  ACCOUNT_UPDATED: "Account updated",
  ROLE_CHANGED: "Role changed",
  PERMISSIONS_CHANGED: "Permissions changed",
  RESIDENCE_VERIFIED: "Residence verified",
  RESIDENCE_REJECTED: "Residence rejected",
  RESIDENCE_EDITED: "Residence edited",
  ACCOUNT_DISABLED: "Account disabled",
  ACCOUNT_ENABLED: "Account enabled",
  CONTRACTOR_CREATED: "Contractor created",
  CONTRACTOR_UPDATED: "Contractor updated",
  CONTRACTOR_DEACTIVATED: "Contractor deactivated",
  INVITE_SENT: "Invite sent",
  PASSWORD_RESET_SENT: "Password reset sent",
  IMPERSONATION_STARTED: "Impersonation started",
  IMPERSONATION_STOPPED: "Impersonation stopped",
  DEMO_RESET: "Demo data reset",
};
export function isAuditAction(v: unknown): v is AuditAction {
  return typeof v === "string" && (AUDIT_ACTIONS as readonly string[]).includes(v);
}

/** Staff permission flags on StaffProfile. ADMIN implies all of them. */
export const STAFF_PERMISSIONS = ["canManageUsers", "canManageContractors", "canVerifyResidence", "canViewAnalytics", "canAssignWork"] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
export const STAFF_PERMISSION_LABEL: Record<StaffPermission, string> = {
  canManageUsers: "Manage users",
  canManageContractors: "Manage contractors",
  canVerifyResidence: "Verify residences",
  canViewAnalytics: "View analytics",
  canAssignWork: "Assign work",
};

/** Parse a comma-separated list column ("PLUMBING,HVAC"), keeping only valid keys. */
export function parseKeyList<T extends string>(csv: string | null | undefined, valid: readonly T[]): T[] {
  if (!csv) return [];
  const set = new Set(valid as readonly string[]);
  return [...new Set(csv.split(",").map((s) => s.trim()).filter((s) => set.has(s)))] as T[];
}

/** Serialize a list of keys for a comma-separated column, rejecting unknown keys. */
export function formatKeyList<T extends string>(keys: readonly string[], valid: readonly T[]): string {
  const set = new Set(valid as readonly string[]);
  const bad = keys.filter((k) => !set.has(k));
  if (bad.length) throw new Error(`Unknown keys: ${bad.join(", ")}`);
  return [...new Set(keys)].join(",");
}

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

/** The URL savePhoto() returns. Lives here (not in uploads.ts) so pure code can validate it. */
export const PHOTO_URL_PATTERN = /^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/;

// Comments: anyone who can see a ticket can add one, with optional photos.
export const MAX_COMMENT_LENGTH = 1000;
// Three downscaled photos fit comfortably under the 6 MB server-action limit
// in next.config.ts.
export const MAX_COMMENT_PHOTOS = 3;

/** Read a TicketEvent's `photos` column (a JSON array of upload URLs). Bad data reads as no photos. */
export function parseEventPhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((u): u is string => typeof u === "string" && u.startsWith("/uploads/")) : [];
  } catch {
    return [];
  }
}
