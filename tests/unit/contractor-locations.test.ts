import { describe, expect, it } from "vitest";
import { pickCurrentLog, sortContractors, spreadOverlaps, summarize } from "@/lib/contractor-locations";

const d = (h: number) => new Date(Date.UTC(2026, 0, 1, h));

describe("pickCurrentLog", () => {
  it("prefers the open log", () => {
    const r = pickCurrentLog([
      { startedAt: d(1), endedAt: d(2), ticket: "old" },
      { startedAt: d(3), endedAt: null, ticket: "now" },
    ]);
    expect(r.state).toBe("working");
    expect(r.log?.ticket).toBe("now");
  });
  it("falls back to the most recently finished log", () => {
    const r = pickCurrentLog([
      { startedAt: d(1), endedAt: d(2), ticket: "a" },
      { startedAt: d(4), endedAt: d(6), ticket: "b" },
    ]);
    expect(r.state).toBe("last_seen");
    expect(r.log?.ticket).toBe("b");
  });
  it("is unknown with no logs", () => expect(pickCurrentLog([]).state).toBe("unknown"));
});

describe("sort, summarize, spread", () => {
  const list = [
    { name: "B", state: "last_seen" as const, availability: "OFF_DUTY" },
    { name: "C", state: "unknown" as const, availability: "AVAILABLE" },
    { name: "A", state: "working" as const, availability: "ON_JOB" },
    { name: "D", state: "last_seen" as const, availability: "ON_BREAK" },
    { name: "E", state: "unknown" as const, availability: "ON_JOB" },
  ];
  it("puts working first, then available", () => expect(sortContractors(list).map((c) => c.name)).toEqual(["A", "E", "C", "D", "B"]));
  it("counts", () => expect(summarize(list)).toEqual({ working: 2, available: 1, onBreak: 1, offDuty: 1 }));
  it("separates markers sharing a spot", () => {
    const [a, b] = spreadOverlaps([
      { lat: 1, lng: 1 },
      { lat: 1, lng: 1 },
    ]);
    expect(a).toEqual({ lat: 1, lng: 1 });
    expect(b.lat !== 1 || b.lng !== 1).toBe(true);
  });
});
