import { describe, expect, it } from "vitest";
import { CATEGORY_DEFAULTS, LOCATION_OVERRIDES, routeTicket } from "@/config/routing";
import { CATEGORIES, DEPARTMENTS, LOCATION_TYPES, type Category, type LocationType } from "@/lib/domain";

describe("routeTicket", () => {
  it("returns a valid department for every category × location type", () => {
    for (const c of CATEGORIES) {
      for (const lt of LOCATION_TYPES) {
        const r = routeTicket(c, lt);
        expect(DEPARTMENTS).toContain(r.department);
        expect(r.rule).toMatch(/→/);
      }
    }
  });

  it.each<[Category, LocationType, string]>([
    // Dorms: Housing owns physical problems
    ["PLUMBING", "DORM_ROOM", "HOUSING"],
    ["HVAC", "DORM_ROOM", "HOUSING"],
    ["ELECTRICAL", "DORM_SHARED", "HOUSING"],
    ["APPLIANCE", "DORM_SHARED", "HOUSING"],
    ["ELEVATOR", "DORM_SHARED", "HOUSING"],
    ["FURNITURE", "DORM_ROOM", "HOUSING"],
    ["OTHER", "DORM_ROOM", "HOUSING"],
    // ...but IT keeps network and AV everywhere
    ["NETWORK", "DORM_ROOM", "IT"],
    ["AV_TECH", "DORM_SHARED", "IT"],
    ["NETWORK", "LIBRARY", "IT"],
    ["AV_TECH", "ACADEMIC", "IT"],
    // Library owns its furniture and cleaning; building systems go to Facilities
    ["FURNITURE", "LIBRARY", "LIBRARY"],
    ["CLEANING", "LIBRARY", "LIBRARY"],
    ["PLUMBING", "LIBRARY", "FACILITIES"],
    ["ELEVATOR", "LIBRARY", "FACILITIES"],
    // Dining owns kitchen equipment and dining-room upkeep
    ["FOOD_SERVICE", "DINING", "DINING"],
    ["APPLIANCE", "DINING", "DINING"],
    ["CLEANING", "DINING", "DINING"],
    ["ELECTRICAL", "DINING", "FACILITIES"],
    ["STRUCTURAL", "DINING", "FACILITIES"],
    // Food equipment outside a dining hall still goes to Dining by default
    ["FOOD_SERVICE", "STUDENT_CENTER", "DINING"],
    // Campus Recreation owns gym equipment and locker-room upkeep
    ["FITNESS", "RECREATION", "RECREATION"],
    ["CLEANING", "RECREATION", "RECREATION"],
    ["PLUMBING", "RECREATION", "FACILITIES"],
    // Classroom buildings and the student center use the defaults
    ["HVAC", "ACADEMIC", "FACILITIES"],
    ["DOORS_LOCKS", "STUDENT_CENTER", "FACILITIES"],
    ["FITNESS", "ACADEMIC", "RECREATION"],
  ])("%s in %s → %s", (category, locationType, expected) => {
    expect(routeTicket(category, locationType).department).toBe(expected);
  });

  it("explains whether a location override or the category default was used", () => {
    expect(routeTicket("PLUMBING", "DORM_ROOM").rule).toBe("PLUMBING in DORM_ROOM → HOUSING");
    expect(routeTicket("PLUMBING", "ACADEMIC").rule).toBe("PLUMBING (default) → FACILITIES");
  });

  it("has a default for every category and only valid departments in overrides", () => {
    for (const c of CATEGORIES) expect(DEPARTMENTS).toContain(CATEGORY_DEFAULTS[c]);
    for (const table of Object.values(LOCATION_OVERRIDES)) {
      for (const [cat, dept] of Object.entries(table ?? {})) {
        expect(CATEGORIES).toContain(cat);
        expect(DEPARTMENTS).toContain(dept);
      }
    }
  });
});
