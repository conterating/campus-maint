import { describe, expect, it } from "vitest";
import { BUFFER_MINUTES, haversineMeters, travelMinutes } from "@/lib/scheduling/geo";
import { breakProblem } from "@/lib/scheduling/breaks";
import {
  bestSlot,
  earliestStart,
  planAssignment,
  rankCandidates,
  reflowJobs,
  scoreCandidate,
  shiftWindows,
  type Block,
  type EngineCandidate,
  type EngineTicket,
  type Shift,
} from "@/lib/scheduling/engine";
import { deriveRequiredSkills } from "@/lib/scheduling/skills";
import { MIN, campusDayAt, campusDayStart, campusTimeOn } from "@/lib/scheduling/time";

// A Monday, 9:00 AM Eastern.
const now = Date.parse("2026-11-16T14:00:00Z");
const dayStart = campusDayStart(now);
const at = (h: number, m = 0) => dayStart + (h * 60 + m) * MIN;
const shift: Shift = {
  shiftStartMinute: 7 * 60,
  shiftEndMinute: 16 * 60,
  workDays: [1, 2, 3, 4, 5],
  onCall: false,
};
const tech = { lat: 33.7756, lng: -84.3963 };
const near = { lat: 33.7757, lng: -84.3964 };
const far = { lat: 33.7756, lng: -84.4063 }; // ~920 m west

describe("travel", () => {
  it("measures distance and walks at 1.25 m/s over a 1.4x path, at least 5 minutes", () => {
    expect(haversineMeters(tech, tech)).toBe(0);
    expect(haversineMeters(tech, far)).toBeGreaterThan(900);
    expect(haversineMeters(tech, far)).toBeLessThan(950);
    expect(travelMinutes(tech, near)).toBe(5);
    expect(travelMinutes(tech, far)).toBe(Math.ceil((haversineMeters(tech, far) * 1.4) / 1.25 / 60));
    expect(travelMinutes(null, far)).toBe(0);
  });
});

describe("earliestStart", () => {
  const base = { shift, origin: null, target: tech, durationMin: 60 };
  it("starts right away when the calendar is empty", () => {
    expect(earliestStart({ ...base, blocks: [], notBefore: now })).toMatchObject({ start: now, end: now + 60 * MIN });
  });
  it("adds travel from where the contractor is plus nothing for an unknown start", () => {
    const r = earliestStart({
      ...base,
      blocks: [],
      origin: { loc: far, at: now },
      notBefore: now,
    })!;
    expect(r.start).toBe(now + travelMinutes(far, tech) * MIN);
  });
  it("waits for the previous job plus travel and the buffer", () => {
    const job: Block = {
      id: "j",
      kind: "JOB",
      start: at(9),
      end: at(10),
      loc: near,
      movable: true,
    };
    const r = earliestStart({ ...base, blocks: [job], notBefore: now })!;
    expect(r.start).toBe(at(10) + (5 + BUFFER_MINUTES) * MIN);
    expect(r.travel).toBe(5);
  });
  it("never overlaps a break", () => {
    const lunch: Block = {
      id: "b",
      kind: "BREAK",
      start: at(9, 30),
      end: at(10),
    };
    expect(earliestStart({ ...base, blocks: [lunch], notBefore: now })!.start).toBe(at(10));
    // a short job still fits before the break
    expect(
      earliestStart({
        ...base,
        durationMin: 30,
        blocks: [lunch],
        notBefore: now,
      })!.start,
    ).toBe(now);
  });
  it("rolls to the next shift when the job won't fit before shift end", () => {
    const r = earliestStart({
      ...base,
      durationMin: 90,
      blocks: [],
      notBefore: at(15),
    })!;
    expect(r.start).toBe(at(7) + 24 * 60 * MIN);
  });
  it("skips days off", () => {
    const friday = at(15) + 4 * 24 * 60 * MIN;
    expect(
      earliestStart({
        ...base,
        durationMin: 90,
        blocks: [],
        notBefore: friday,
      })!.start,
    ).toBe(at(7) + 7 * 24 * 60 * MIN);
  });
  it("lets an on-call contractor take an Emergency outside their shift only", () => {
    const onCall = { ...shift, onCall: true };
    const night = at(22);
    expect(
      earliestStart({
        ...base,
        shift: onCall,
        blocks: [],
        notBefore: night,
        emergency: true,
      })!.start,
    ).toBe(night);
    expect(earliestStart({ ...base, shift: onCall, blocks: [], notBefore: night })!.start).toBeGreaterThan(night);
  });
});

describe("emergency preemption", () => {
  const standard: Block = {
    id: "s",
    kind: "JOB",
    start: at(9),
    end: at(11),
    loc: tech,
    rank: 2,
    movable: true,
    ticketNumber: 1010,
  };
  const args = {
    shift,
    origin: null,
    target: tech,
    durationMin: 60,
    notBefore: now,
    blocks: [standard],
  };
  it("bumps a lower-priority scheduled job", () => {
    const slot = bestSlot({ ...args, rank: 4 })!;
    expect(slot.start).toBe(now);
    expect(slot.displaced.map((d) => d.id)).toEqual(["s"]);
  });
  it("does not bump for a Standard ticket, and never bumps work in progress", () => {
    expect(bestSlot({ ...args, rank: 2 })!.displaced).toEqual([]);
    const active = { ...standard, movable: false };
    const slot = bestSlot({ ...args, blocks: [active], rank: 4 })!;
    expect(slot.start).toBeGreaterThanOrEqual(at(11));
    expect(slot.displaced).toEqual([]);
  });
  it("pushes the bumped job later instead of deleting it", () => {
    const emergency: Block = {
      id: "e",
      kind: "JOB",
      start: now,
      end: now + 60 * MIN,
      loc: tech,
      rank: 4,
    };
    const moved = reflowJobs({
      shift,
      fixed: [],
      jobs: [emergency, standard],
      origin: null,
      now,
    });
    expect(moved.get("e")!.start).toBe(now);
    expect(moved.get("s")!.start).toBeGreaterThanOrEqual(at(10) + BUFFER_MINUTES * MIN);
    expect(moved.get("s")!.end - moved.get("s")!.start).toBe(2 * 60 * MIN);
  });
  it("re-flows later jobs past a new break", () => {
    const brk: Block = {
      id: "b",
      kind: "BREAK",
      start: at(9, 30),
      end: at(10, 30),
    };
    const moved = reflowJobs({
      shift,
      fixed: [brk],
      jobs: [standard],
      origin: null,
      now,
    });
    expect(moved.get("s")!.start).toBe(at(10, 30));
  });
});

const ticket = (over: Partial<EngineTicket> = {}): EngineTicket => ({
  id: "t1",
  number: 1100,
  loc: tech,
  severity: "STANDARD",
  requiredSkills: ["ELECTRICIAN"],
  estimatedMinutes: 60,
  responseDueAt: new Date(now + 4 * 60 * MIN),
  meTooCount: 0,
  ...over,
});
const cand = (id: string, skills: EngineCandidate["skills"], over: Partial<EngineCandidate> = {}): EngineCandidate => ({
  userId: id,
  name: id,
  shift,
  skills,
  blocks: [],
  origin: { loc: tech, at: now },
  openJobs: 0,
  maxJobs: 8,
  ...over,
});

describe("scoring and ranking", () => {
  it("prefers the closer, less loaded, sooner contractor when skills tie", () => {
    const ranked = rankCandidates(
      ticket(),
      [cand("far", ["ELECTRICIAN"], { origin: { loc: far, at: now } }), cand("busy", ["ELECTRICIAN"], { openJobs: 7 }), cand("best", ["ELECTRICIAN"])],
      now,
    );
    expect(ranked[0].candidate.userId).toBe("best");
    expect(ranked.map((r) => r.score)).toEqual([...ranked.map((r) => r.score)].sort((a, b) => b - a));
    expect(ranked.find((r) => r.candidate.userId === "far")!.slot.travel).toBeGreaterThan(10);
    expect(ranked[0].reasons).toMatch(/Electrician ✓ · \d+ min away · free (now|at [\d:]+ [AP]M) · 0 open jobs/);
  });
  it("puts a full skill match ahead of a closer partial one", () => {
    const t = ticket({ requiredSkills: ["ELECTRICIAN", "PLUMBER"] });
    const ranked = rankCandidates(
      t,
      [
        cand("partialNear", ["ELECTRICIAN"]),
        cand("full", ["ELECTRICIAN", "PLUMBER"], {
          origin: { loc: far, at: now },
        }),
      ],
      now,
    );
    expect(ranked[0].candidate.userId).toBe("full");
  });
  it("weights urgency and me-too counts into the timeliness term", () => {
    const base = {
      coverage: 1,
      travelMin: 5,
      start: now + 60 * MIN,
      now,
      due: now + 4 * 60 * MIN,
      meToo: 0,
      openJobs: 0,
      maxJobs: 8,
      onCallOnEmergency: false,
      displaced: 0,
    };
    expect(scoreCandidate({ ...base, severity: "URGENT" })).toBeGreaterThan(scoreCandidate({ ...base, severity: "STANDARD" }));
    expect(scoreCandidate({ ...base, severity: "STANDARD", meToo: 5 })).toBeGreaterThan(scoreCandidate({ ...base, severity: "STANDARD" }));
    expect(scoreCandidate({ ...base, severity: "EMERGENCY", displaced: 2 })).toBeLessThan(scoreCandidate({ ...base, severity: "EMERGENCY" }));
  });
});

describe("multi-contractor coverage", () => {
  it("adds a helper for the skills the primary lacks, at the same start", () => {
    const t = ticket({ requiredSkills: ["ELECTRICIAN", "PLUMBER"] });
    const plan = planAssignment(
      t,
      [
        cand("sparky", ["ELECTRICIAN"]),
        cand("pipes", ["PLUMBER"], {
          blocks: [{ id: "x", kind: "BREAK", start: now, end: now + 30 * MIN }],
        }),
      ],
      now,
    )!;
    expect(plan.members.map((m) => [m.evaluation.candidate.userId, m.role])).toEqual([
      ["sparky", "PRIMARY"],
      ["pipes", "HELPER"],
    ]);
    expect(new Set(plan.members.map((m) => m.start)).size).toBe(1);
    expect(plan.members[0].start).toBeGreaterThanOrEqual(now + 30 * MIN);
  });
  it("gives an Emergency a backup helper when someone is available", () => {
    const plan = planAssignment(ticket({ severity: "EMERGENCY" }), [cand("a", ["ELECTRICIAN"]), cand("b", ["ELECTRICIAN"], { name: "b" })], now)!;
    expect(plan.members.map((m) => m.role)).toEqual(["PRIMARY", "HELPER"]);
    expect(plan.members[1].reasons).toMatch(/backup/);
  });
  it("returns null when nobody has a matching skill", () => {
    expect(planAssignment(ticket(), [cand("a", ["PLUMBER"])], now)).toBeNull();
  });
});

describe("skills from a description", () => {
  it("starts from the category and adds keyword hints", () => {
    expect(deriveRequiredSkills("ELECTRICAL", "The breaker keeps tripping")).toEqual(["ELECTRICIAN"]);
    expect(deriveRequiredSkills("PLUMBING", "Leak under the sink and sparks from the outlet")).toEqual(["PLUMBER", "ELECTRICIAN"]);
    expect(deriveRequiredSkills("OTHER", "My keycard won't open the door")).toEqual(["LOCKSMITH"]);
  });
});

describe("breaks", () => {
  const ok = {
    start: now + 60 * MIN,
    end: now + 90 * MIN,
    now,
    existing: [],
    inProgress: [],
    sameDayCount: 0,
  };
  it("accepts a normal break", () => expect(breakProblem(ok)).toBeNull());
  it("rejects overlaps, long breaks, past breaks and too many a day", () => {
    expect(
      breakProblem({
        ...ok,
        existing: [{ start: ok.start + 10 * MIN, end: ok.end + 10 * MIN }],
      }),
    ).toMatch(/overlaps/);
    expect(breakProblem({ ...ok, end: ok.start + 5 * 60 * MIN })).toMatch(/at most/);
    expect(breakProblem({ ...ok, start: now - 60 * MIN, end: now - 30 * MIN })).toMatch(/over/);
    expect(breakProblem({ ...ok, sameDayCount: 10 })).toMatch(/up to 10/);
    expect(
      breakProblem({
        ...ok,
        inProgress: [{ start: now, end: now + 2 * 60 * MIN }],
      }),
    ).toMatch(/middle of a job/);
  });
});

describe("emergency bump survives a reflow (reviewer probes)", () => {
  const job = (id: string, start: number, end: number, rank: number): Block => ({
    id,
    kind: "JOB",
    start,
    end,
    loc: tech,
    rank,
    movable: true,
    ticketNumber: 1,
  });
  it("an unstarted job at 8:30-9:30 does not keep the slot an Emergency takes at 8:55", () => {
    const n = at(8, 55);
    const low = job("low", at(8, 30), at(9, 30), 2);
    const slot = bestSlot({
      shift,
      blocks: [low],
      origin: null,
      target: tech,
      durationMin: 60,
      notBefore: n,
      rank: 4,
    })!;
    expect(slot.start).toBe(n);
    const emer = { ...job("emer", slot.start, slot.end, 4) };
    for (const pinned of [false, true]) {
      const placed = reflowJobs({
        shift,
        fixed: [],
        jobs: [low, { ...emer, pinned }],
        origin: null,
        now: n,
      });
      expect(placed.get("emer")).toMatchObject({ start: n, end: n + 60 * MIN });
      expect(placed.get("low")!.start).toBeGreaterThanOrEqual(placed.get("emer")!.end + BUFFER_MINUTES * MIN);
    }
  });
  it("a job at 9:00 with the Emergency placed at 9:05 after 5 min travel stays behind it", () => {
    const n = at(9, 5);
    const a = job("a", at(9), at(10), 1);
    const origin = { loc: tech, at: n };
    const slot = bestSlot({
      shift,
      blocks: [a],
      origin,
      target: tech,
      durationMin: 30,
      notBefore: n,
      rank: 4,
    })!;
    expect(slot.displaced.map((d) => d.id)).toEqual(["a"]);
    const placed = reflowJobs({
      shift,
      fixed: [],
      jobs: [a, job("e", slot.start, slot.end, 4)],
      origin,
      now: n,
    });
    expect(placed.get("e")!.start).toBe(slot.start);
    expect(placed.get("a")!.start).toBeGreaterThanOrEqual(slot.end);
  });
  it("a pinned job stays put even when a higher-ranked one would like its slot", () => {
    const pinned = { ...job("p", at(10), at(11), 2), pinned: true };
    const placed = reflowJobs({
      shift,
      fixed: [],
      jobs: [pinned, job("urgent", at(10), at(11), 3)],
      origin: null,
      now,
    });
    expect(placed.get("p")).toMatchObject({
      start: at(10),
      end: at(11),
      fit: true,
    });
    expect(placed.get("urgent")!.start).toBeGreaterThanOrEqual(at(11));
  });
  it("flags a job nothing fits instead of silently keeping an overlapping time", () => {
    const noDays: Shift = { ...shift, workDays: [] };
    const placed = reflowJobs({
      shift: noDays,
      fixed: [],
      jobs: [job("j", at(9), at(10), 2)],
      origin: null,
      now,
    });
    expect(placed.get("j")).toMatchObject({ start: at(9), fit: false });
  });
  it("moves a job that no longer fits today into the next shift", () => {
    const brk: Block = { id: "b", kind: "BREAK", start: at(9), end: at(16) };
    const placed = reflowJobs({
      shift,
      fixed: [brk],
      jobs: [job("j", at(9), at(10), 2)],
      origin: null,
      now,
    });
    expect(placed.get("j")).toMatchObject({ fit: true });
    expect(placed.get("j")!.start).toBe(campusTimeOn(campusDayAt(now, 1), 7 * 60));
  });
});

describe("Emergencies never wait for backups or helpers", () => {
  const emergency = ticket({
    severity: "EMERGENCY",
    requiredSkills: ["PLUMBER"],
    responseDueAt: new Date(now + 60 * MIN),
  });
  const plumber = (id: string, blocks: Block[] = []) => cand(id, ["PLUMBER"], { blocks, origin: null });
  it("keeps the primary at its own earliest slot when the backup is busy for hours", () => {
    const busy: Block = { id: "b1", kind: "BREAK", start: at(9), end: at(13) };
    const plan = planAssignment(emergency, [plumber("free"), plumber("tied", [busy])], now)!;
    const primary = plan.members.find((m) => m.role === "PRIMARY")!;
    expect(primary.start).toBe(now);
    expect(plan.members.filter((m) => m.role === "HELPER")).toEqual([]); // too late to be a backup
  });
  it("keeps a backup that can start within half an hour of the primary, at its own slot", () => {
    const soon: Block = {
      id: "b2",
      kind: "BREAK",
      start: at(9),
      end: at(9, 20),
    };
    const plan = planAssignment(emergency, [plumber("free"), plumber("soon", [soon])], now)!;
    expect(plan.members[0].start).toBe(now);
    expect(plan.members[1]).toMatchObject({ role: "HELPER", start: at(9, 20) });
  });
  it("does not hold an Emergency primary for a skill helper who is hours away", () => {
    const t = ticket({
      severity: "EMERGENCY",
      requiredSkills: ["ELECTRICIAN", "PLUMBER"],
      responseDueAt: new Date(now + 60 * MIN),
    });
    const away: Block = {
      id: "w",
      kind: "JOB",
      start: at(8),
      end: at(13),
      loc: tech,
      rank: 3,
      movable: false,
    };
    const plan = planAssignment(t, [cand("sparky", ["ELECTRICIAN"], { origin: null }), cand("pipes", ["PLUMBER"], { blocks: [away], origin: null })], now)!;
    expect(plan.members[0]).toMatchObject({ role: "PRIMARY", start: now });
    expect(plan.members[1].start).toBeGreaterThanOrEqual(at(13));
  });
  it("still aligns a non-emergency primary with its helper", () => {
    const t = ticket({ requiredSkills: ["ELECTRICIAN", "PLUMBER"] });
    const away: Block = {
      id: "w",
      kind: "JOB",
      start: at(8),
      end: at(11),
      loc: tech,
      rank: 3,
      movable: false,
    };
    const plan = planAssignment(t, [cand("sparky", ["ELECTRICIAN"]), cand("pipes", ["PLUMBER"], { blocks: [away] })], now)!;
    expect(new Set(plan.members.map((m) => m.start)).size).toBe(1);
    expect(plan.members.some((m) => m.role === "PRIMARY")).toBe(true);
  });
  it("never drops the primary when the helpers can't line up", () => {
    const t = ticket({ requiredSkills: ["ELECTRICIAN", "PLUMBER"] });
    const gone: Block = {
      id: "g",
      kind: "BREAK",
      start: now - 60 * MIN,
      end: now + 400 * 24 * 60 * MIN,
    };
    const plan = planAssignment(t, [cand("sparky", ["ELECTRICIAN"]), cand("pipes", ["PLUMBER"], { blocks: [gone] })], now);
    expect(plan?.members[0].role).toBe("PRIMARY");
  });
});

describe("campus days across DST", () => {
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(ms);
  it("campusDayStart is midnight on the change days themselves", () => {
    expect(fmt(campusDayStart(Date.parse("2027-03-14T20:00:00Z")))).toBe("14/03/2027, 00:00"); // spring forward
    expect(fmt(campusDayStart(Date.parse("2026-11-01T20:00:00Z")))).toBe("01/11/2026, 00:00"); // fall back
  });
  it("campusDayAt lands on midnight of each following day across the March 14 2027 and Nov 1 2026 changes", () => {
    const march = Date.parse("2027-03-10T15:00:00Z");
    const expected = ["10/03", "11/03", "12/03", "13/03", "14/03", "15/03", "16/03"];
    expected.forEach((d, i) => expect(fmt(campusDayAt(march, i))).toBe(`${d}/2027, 00:00`));
    const nov = Date.parse("2026-10-28T15:00:00Z");
    ["28/10", "29/10", "30/10", "31/10", "01/11", "02/11", "03/11"].forEach((d, i) => expect(fmt(campusDayAt(nov, i))).toBe(`${d}/2026, 00:00`));
  });
  it("shift windows keep the same wall-clock hours before and after a change", () => {
    const week: Shift = { ...shift, workDays: [0, 1, 2, 3, 4, 5, 6] };
    for (const from of [Date.parse("2027-03-12T15:00:00Z"), Date.parse("2026-10-30T14:00:00Z")]) {
      for (const [s, e] of shiftWindows(week, from, false).slice(0, 4)) {
        expect(fmt(s).slice(-5)).toBe("07:00");
        expect(fmt(e).slice(-5)).toBe("16:00");
      }
    }
  });
  it("campusTimeOn puts wall-clock times right on a change day", () => {
    expect(fmt(campusTimeOn(campusDayAt(Date.parse("2027-03-10T15:00:00Z"), 4), 9 * 60))).toBe("14/03/2027, 09:00");
    expect(fmt(campusTimeOn(campusDayAt(Date.parse("2026-10-28T15:00:00Z"), 4), 9 * 60))).toBe("01/11/2026, 09:00");
  });
});
