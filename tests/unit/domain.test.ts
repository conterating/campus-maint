import { describe, expect, it } from "vitest";
import { canReportAt, canView, ticketVisibilityWhere, type Viewer } from "@/lib/visibility";
import { formatTicketNumber, isOpenStatus, locationTypeFor, ticketScopeFor } from "@/lib/domain";

const student = (over: Partial<Viewer> = {}): Viewer => ({
  id: "s1",
  name: "Test Student",
  role: "STUDENT",
  department: null,
  isSupervisor: false,
  residenceBuildingId: "b-glenn",
  roomId: "s-gln-214",
  ...over,
});

describe("location type and scope", () => {
  it("treats a dorm room as ROOM scope and a dorm shared area as DORM scope", () => {
    expect(locationTypeFor("RESIDENCE", "DORM_ROOM")).toBe("DORM_ROOM");
    expect(ticketScopeFor("RESIDENCE", "DORM_ROOM")).toBe("ROOM");
    expect(locationTypeFor("RESIDENCE", "DORM_SHARED")).toBe("DORM_SHARED");
    expect(ticketScopeFor("RESIDENCE", "DORM_SHARED")).toBe("DORM");
  });

  it("treats a residence hall with no specific space as a shared area (never public)", () => {
    expect(ticketScopeFor("RESIDENCE", null)).toBe("DORM");
    expect(ticketScopeFor("RESIDENCE", undefined)).toBe("DORM");
    // Even a mislabelled PUBLIC space inside a dorm stays private to residents.
    expect(ticketScopeFor("RESIDENCE", "PUBLIC")).toBe("DORM");
  });

  it("makes every non-residence building public", () => {
    for (const kind of ["LIBRARY", "DINING", "STUDENT_CENTER", "RECREATION", "ACADEMIC"]) {
      expect(ticketScopeFor(kind, "PUBLIC")).toBe("PUBLIC");
      expect(ticketScopeFor(kind, null)).toBe("PUBLIC");
    }
    expect(locationTypeFor("ACADEMIC", null)).toBe("ACADEMIC");
    expect(locationTypeFor("SOMETHING_NEW", null)).toBe("ACADEMIC");
  });

  it("formats ticket numbers and open statuses", () => {
    expect(formatTicketNumber(1042)).toBe("RR-1042");
    expect(isOpenStatus("REOPENED")).toBe(true);
    expect(isOpenStatus("RESOLVED")).toBe(false);
    expect(isOpenStatus("CONFIRMED")).toBe(false);
  });
});

describe("ticketVisibilityWhere", () => {
  it("gives staff and admins no filter", () => {
    expect(ticketVisibilityWhere(student({ role: "STAFF", department: "HOUSING" }))).toEqual({});
    expect(ticketVisibilityWhere(student({ role: "ADMIN" }))).toEqual({});
  });

  it("limits a resident to public, their hall, and their room", () => {
    expect(ticketVisibilityWhere(student())).toEqual({
      OR: [{ scope: "PUBLIC" }, { scope: "DORM", buildingId: "b-glenn" }, { scope: "ROOM", spaceId: "s-gln-214" }],
    });
  });

  it("limits an off-campus student to public tickets only", () => {
    expect(ticketVisibilityWhere(student({ residenceBuildingId: null, roomId: null }))).toEqual({ OR: [{ scope: "PUBLIC" }] });
  });
});

describe("canView", () => {
  const roomTicket = { scope: "ROOM", buildingId: "b-glenn", spaceId: "s-gln-214" };
  const otherRoom = { scope: "ROOM", buildingId: "b-glenn", spaceId: "s-gln-309" };
  const glennShared = { scope: "DORM", buildingId: "b-glenn", spaceId: "s-gln-2bath" };
  const towersShared = { scope: "DORM", buildingId: "b-towers", spaceId: "s-twr-3hall" };
  const library = { scope: "PUBLIC", buildingId: "b-library", spaceId: null };

  it("matches the server filter for residents, outsiders, and staff", () => {
    const resident = student();
    expect(canView(resident, roomTicket)).toBe(true);
    expect(canView(resident, otherRoom)).toBe(false);
    expect(canView(resident, glennShared)).toBe(true);
    expect(canView(resident, towersShared)).toBe(false);
    expect(canView(resident, library)).toBe(true);

    const offCampus = student({ residenceBuildingId: null, roomId: null });
    expect([roomTicket, otherRoom, glennShared, towersShared].some((t) => canView(offCampus, t))).toBe(false);
    expect(canView(offCampus, library)).toBe(true);

    const staff = student({ role: "STAFF", department: "IT", residenceBuildingId: null, roomId: null });
    expect([roomTicket, otherRoom, glennShared, towersShared, library].every((t) => canView(staff, t))).toBe(true);
  });

  it("denies unknown scopes", () => {
    expect(canView(student(), { scope: "SECRET", buildingId: "b-glenn", spaceId: null })).toBe(false);
  });
});

describe("canReportAt", () => {
  const loc = (buildingKind: string, buildingId: string, spaceScope: string | null, spaceId: string | null) => ({ buildingKind, buildingId, spaceScope, spaceId });

  it("lets students report in public buildings, their own hall, and their own room", () => {
    const s = student();
    expect(canReportAt(s, loc("LIBRARY", "b-library", "PUBLIC", "s-lib-2study")).ok).toBe(true);
    expect(canReportAt(s, loc("RESIDENCE", "b-glenn", "DORM_SHARED", "s-gln-2bath")).ok).toBe(true);
    expect(canReportAt(s, loc("RESIDENCE", "b-glenn", "DORM_ROOM", "s-gln-214")).ok).toBe(true);
    expect(canReportAt(s, loc("RESIDENCE", "b-glenn", null, null)).ok).toBe(true);
  });

  it("blocks students from other halls and other rooms", () => {
    const s = student();
    const otherHall = canReportAt(s, loc("RESIDENCE", "b-towers", "DORM_SHARED", "s-twr-3hall"));
    expect(otherHall).toEqual({ ok: false, reason: expect.stringMatching(/residence hall you live in/) });
    const otherRoom = canReportAt(s, loc("RESIDENCE", "b-glenn", "DORM_ROOM", "s-gln-309"));
    expect(otherRoom).toEqual({ ok: false, reason: expect.stringMatching(/your own room/) });
    expect(canReportAt(student({ residenceBuildingId: null, roomId: null }), loc("RESIDENCE", "b-glenn", "DORM_SHARED", "s-gln-2bath")).ok).toBe(false);
  });

  it("lets staff report anywhere", () => {
    const staff = student({ role: "STAFF", department: "HOUSING", residenceBuildingId: null, roomId: null });
    expect(canReportAt(staff, loc("RESIDENCE", "b-towers", "DORM_ROOM", "s-twr-305")).ok).toBe(true);
  });
});
