// Routing rules: which department owns an issue, by category and location type.
//
// How a department is chosen:
//   1. If LOCATION_OVERRIDES[locationType][category] exists, use it.
//   2. Otherwise use CATEGORY_DEFAULTS[category].
//
// Edit this file to change routing. Tests in tests/unit/routing.test.ts pin the
// behaviour the demo relies on.
import type { Category, Department, LocationType } from "@/lib/domain";
import { CATEGORIES } from "@/lib/domain";

export const CATEGORY_DEFAULTS: Record<Category, Department> = {
  PLUMBING: "FACILITIES",
  ELECTRICAL: "FACILITIES",
  HVAC: "FACILITIES",
  ELEVATOR: "FACILITIES",
  APPLIANCE: "FACILITIES",
  NETWORK: "IT",
  AV_TECH: "IT",
  FURNITURE: "FACILITIES",
  DOORS_LOCKS: "FACILITIES",
  CLEANING: "FACILITIES",
  FOOD_SERVICE: "DINING",
  FITNESS: "RECREATION",
  STRUCTURAL: "FACILITIES",
  OTHER: "FACILITIES",
};

/** Everything physical inside a residence hall goes to Housing; network and AV stay with IT. */
const housingOwnsAllButTech: Partial<Record<Category, Department>> = Object.fromEntries(
  CATEGORIES.filter((c) => c !== "NETWORK" && c !== "AV_TECH").map((c) => [c, "HOUSING" as Department]),
);

export const LOCATION_OVERRIDES: Partial<Record<LocationType, Partial<Record<Category, Department>>>> = {
  DORM_ROOM: housingOwnsAllButTech,
  DORM_SHARED: housingOwnsAllButTech,
  LIBRARY: {
    FURNITURE: "LIBRARY",
    CLEANING: "LIBRARY",
    OTHER: "LIBRARY",
  },
  DINING: {
    FOOD_SERVICE: "DINING",
    APPLIANCE: "DINING",
    FURNITURE: "DINING",
    CLEANING: "DINING",
    OTHER: "DINING",
  },
  RECREATION: {
    FITNESS: "RECREATION",
    APPLIANCE: "RECREATION",
    FURNITURE: "RECREATION",
    CLEANING: "RECREATION",
    OTHER: "RECREATION",
  },
  // ACADEMIC and STUDENT_CENTER use the category defaults.
};

export type RouteDecision = {
  department: Department;
  /** Human-readable explanation shown to students and staff. */
  rule: string;
};

export function routeTicket(category: Category, locationType: LocationType): RouteDecision {
  const override = LOCATION_OVERRIDES[locationType]?.[category];
  if (override) {
    return { department: override, rule: `${category} in ${locationType} → ${override}` };
  }
  const fallback = CATEGORY_DEFAULTS[category] ?? "FACILITIES";
  return { department: fallback, rule: `${category} (default) → ${fallback}` };
}
