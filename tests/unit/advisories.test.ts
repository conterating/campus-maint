import { describe, expect, it } from "vitest";
import { canClearAdvisory, compareAdvisories, isAdvisoryActive, validateAdvisoryInput } from "@/lib/advisories";
import type { Viewer } from "@/lib/visibility";

const now = new Date("2026-11-15T12:00:00Z");
const H = 3_600_000;
const ok = { title: "  Avoid Ferst Drive ", message: " Water main repair. ", severity: "WARNING", area: " Ferst Drive " };
const viewer = (over: Partial<Viewer>): Viewer => ({ id: "u1", name: "U", role: "STAFF", department: null, isSupervisor: false, residenceBuildingId: null, roomId: null, ...over });

describe("validateAdvisoryInput", () => {
  it("trims, defaults startsAt to now, and nulls blanks", () => {
    const v = validateAdvisoryInput({ ...ok, buildingId: "", endsAt: "", lat: "", lng: "" }, now);
    expect(v).toMatchObject({ title: "Avoid Ferst Drive", message: "Water main repair.", area: "Ferst Drive", buildingId: null, endsAt: null, lat: null });
    expect(v.startsAt).toEqual(now);
  });
  it("rejects bad severity, empty and oversized text, missing place", () => {
    expect(() => validateAdvisoryInput({ ...ok, severity: "PANIC" }, now)).toThrow();
    expect(() => validateAdvisoryInput({ ...ok, title: "   " }, now)).toThrow(/Title/);
    expect(() => validateAdvisoryInput({ ...ok, message: "x".repeat(1001) }, now)).toThrow();
    expect(() => validateAdvisoryInput({ ...ok, area: "", buildingId: "" }, now)).toThrow(/where/);
    expect(validateAdvisoryInput({ ...ok, area: "", buildingId: "b-1" }, now).buildingId).toBe("b-1");
  });
  it("rejects endsAt at or before startsAt, and invalid dates", () => {
    expect(() => validateAdvisoryInput({ ...ok, endsAt: now.toISOString() }, now)).toThrow(/after/);
    expect(() => validateAdvisoryInput({ ...ok, startsAt: new Date(now.getTime() + H).toISOString(), endsAt: now.toISOString() }, now)).toThrow(/after/);
    expect(() => validateAdvisoryInput({ ...ok, endsAt: "not a date" }, now)).toThrow();
    expect(validateAdvisoryInput({ ...ok, endsAt: new Date(now.getTime() + H).toISOString() }, now).endsAt).toEqual(new Date(now.getTime() + H));
  });
  it("needs lat and lng together, within range", () => {
    expect(() => validateAdvisoryInput({ ...ok, lat: 33.77 }, now)).toThrow();
    expect(() => validateAdvisoryInput({ ...ok, lat: 99, lng: -84 }, now)).toThrow();
    expect(validateAdvisoryInput({ ...ok, lat: "33.77", lng: "-84.39" }, now)).toMatchObject({ lat: 33.77, lng: -84.39 });
  });
});

describe("isAdvisoryActive", () => {
  const w = (s: number, e: number | null, c: number | null = null) => ({
    startsAt: new Date(now.getTime() + s * H),
    endsAt: e === null ? null : new Date(now.getTime() + e * H),
    clearedAt: c === null ? null : new Date(now.getTime() + c * H),
  });
  it("is active between start and end, open-ended when endsAt is null", () => {
    expect(isAdvisoryActive(w(-1, 1), now)).toBe(true);
    expect(isAdvisoryActive(w(-1, null), now)).toBe(true);
    expect(isAdvisoryActive(w(0, 1), now)).toBe(true);
  });
  it("is inactive before start, at or after end, or once cleared", () => {
    expect(isAdvisoryActive(w(1, null), now)).toBe(false);
    expect(isAdvisoryActive(w(-2, 0), now)).toBe(false);
    expect(isAdvisoryActive(w(-2, -1), now)).toBe(false);
    expect(isAdvisoryActive(w(-2, 5, -1), now)).toBe(false);
  });
});

describe("ordering and permissions", () => {
  it("sorts emergencies first, then newest", () => {
    const a = { severity: "INFO", startsAt: new Date(2) };
    const b = { severity: "EMERGENCY", startsAt: new Date(1) };
    const c = { severity: "INFO", startsAt: new Date(3) };
    expect([a, b, c].sort(compareAdvisories)).toEqual([b, c, a]);
  });
  it("lets admins clear anything, staff only their own, students nothing", () => {
    expect(canClearAdvisory(viewer({ role: "ADMIN", id: "a" }), { createdById: "u1" })).toBe(true);
    expect(canClearAdvisory(viewer({}), { createdById: "u1" })).toBe(true);
    expect(canClearAdvisory(viewer({}), { createdById: "u2" })).toBe(false);
    expect(canClearAdvisory(viewer({ role: "STUDENT" }), { createdById: "u1" })).toBe(false);
  });
});
