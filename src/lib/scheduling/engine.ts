// The scheduling engine: pure functions over plain data (no database, no clock).
//
// A contractor's day is a list of Blocks (scheduled jobs and breaks) inside their
// shift windows. For a new ticket we find each eligible contractor's EARLIEST
// FEASIBLE START, score them, and pick a plan (a primary plus helpers when one
// person can't cover every skill, plus a backup for Emergencies).
import { SEVERITY_RANK, SKILL_LABEL, type Severity, type Skill } from "../domain";
import { BUFFER_MINUTES, travelMinutes, type LatLng } from "./geo";
import { DAY_MS, MIN, campusDayAt, campusDayStart, campusParts, campusTimeOn, formatClock, formatDay } from "./time";

export const HORIZON_DAYS = 14;
const EMERGENCY_RANK = SEVERITY_RANK.EMERGENCY;

export type Block = {
  id: string;
  kind: "JOB" | "BREAK";
  start: number;
  end: number;
  loc?: LatLng | null;
  /** Severity rank of a job (4 = Emergency). */
  rank?: number;
  /** A SCHEDULED job may be pushed later. In-progress jobs and breaks may not. */
  movable?: boolean;
  /** Reflow treats a pinned job as fixed (e.g. an Emergency that was just placed on purpose). */
  pinned?: boolean;
  ticketId?: string;
  ticketNumber?: number;
};

export type Shift = { shiftStartMinute: number; shiftEndMinute: number; workDays: number[]; onCall: boolean };
export type Slot = { start: number; end: number; travel: number; displaced: Block[] };

type Origin = { loc: LatLng | null; at: number };

/** Shift windows (ms) for the next two weeks, or one open-ended window for an on-call Emergency. */
export function shiftWindows(shift: Shift, from: number, continuous: boolean): [number, number][] {
  if (continuous) return [[from, from + HORIZON_DAYS * DAY_MS]];
  const out: [number, number][] = [];
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const ds = campusDayAt(from, i);
    if (!shift.workDays.includes(campusParts(ds + 12 * 60 * MIN).dow)) continue;
    const w: [number, number] = [campusTimeOn(ds, shift.shiftStartMinute), campusTimeOn(ds, shift.shiftEndMinute)];
    if (w[1] > from) out.push(w);
  }
  return out;
}

/** Minutes of walking plus the fixed buffer needed between a block and a job at `target`. */
function gapMs(b: Block | { kind: "ORIGIN"; loc: LatLng | null }, target: LatLng | null | undefined): number {
  if (b.kind === "BREAK") return 0;
  const travel = travelMinutes(b.loc, target);
  return (b.kind === "ORIGIN" ? travel : travel + BUFFER_MINUTES) * MIN;
}

type Obstacle = { start: number; end: number; gap: (target: LatLng | null | undefined) => number; block?: Block };

function obstaclesOf(blocks: Block[], origin: Origin | null): Obstacle[] {
  const out: Obstacle[] = blocks.map((b) => ({ start: b.start, end: b.end, gap: (t) => gapMs(b, t), block: b }));
  if (origin) out.push({ start: origin.at, end: origin.at, gap: (t) => gapMs({ kind: "ORIGIN", loc: origin.loc }, t) });
  return out;
}

const clashes = (o: Obstacle, s: number, e: number, target: LatLng | null | undefined) => {
  const g = o.gap(target);
  return s < o.end + g && e + g > o.start;
};

/** First time at or after `notBefore` when a job of `durationMin` fits (null if none in two weeks). */
export function earliestStart(a: {
  shift: Shift;
  blocks: Block[];
  origin: Origin | null;
  target: LatLng | null | undefined;
  durationMin: number;
  notBefore: number;
  emergency?: boolean;
}): { start: number; end: number; travel: number } | null {
  const dur = a.durationMin * MIN;
  const windows = shiftWindows(a.shift, a.notBefore, !!a.emergency && a.shift.onCall);
  const obstacles = obstaclesOf(a.blocks, a.origin);
  let t = a.notBefore;
  for (let i = 0; i < 600; i++) {
    const w = windows.find(([, we]) => we > t);
    if (!w) return null;
    const s = Math.max(t, w[0]);
    if (s + dur > w[1]) {
      t = w[1];
      continue;
    }
    const hit = obstacles.find((o) => clashes(o, s, s + dur, a.target));
    if (hit) {
      t = Math.max(s + 1, hit.end + hit.gap(a.target));
      continue;
    }
    const prev = [...a.blocks.filter((b) => b.kind === "JOB" && b.end <= s), ...(a.origin ? [{ end: a.origin.at, loc: a.origin.loc }] : [])].sort((x, y) => y.end - x.end)[0];
    return { start: s, end: s + dur, travel: travelMinutes(prev?.loc, a.target) };
  }
  return null;
}

/**
 * Like earliestStart, but an Emergency may bump lower-priority SCHEDULED jobs:
 * it takes the earliest slot that only has to respect breaks, in-progress work
 * and other emergencies. The bumped jobs are returned so the caller can push
 * them later (see reflowJobs), never delete them.
 */
export function bestSlot(a: {
  shift: Shift;
  blocks: Block[];
  origin: Origin | null;
  target: LatLng | null | undefined;
  durationMin: number;
  notBefore: number;
  rank: number;
}): Slot | null {
  const emergency = a.rank >= EMERGENCY_RANK;
  const normal = earliestStart({ ...a, emergency });
  if (!emergency) return normal && { ...normal, displaced: [] };
  const fixed = a.blocks.filter((b) => !(b.kind === "JOB" && b.movable && (b.rank ?? 0) < EMERGENCY_RANK));
  const bump = earliestStart({ ...a, blocks: fixed, emergency });
  if (!bump) return normal && { ...normal, displaced: [] };
  if (normal && normal.start <= bump.start) return { ...normal, displaced: [] };
  const obstacles = a.blocks.filter((b) => b.kind === "JOB" && b.movable && (b.rank ?? 0) < EMERGENCY_RANK);
  const displaced = obstacles.filter((b) => clashes({ start: b.start, end: b.end, gap: (t) => gapMs(b, t) }, bump.start, bump.end, a.target));
  return { ...bump, displaced };
}

export type Placement = { start: number; end: number; travel: number; /** False when no slot fit in the horizon (the job keeps its old time). */ fit: boolean };

/**
 * Re-lay-out SCHEDULED jobs around fixed blocks (breaks, in-progress work). Pinned jobs
 * stay exactly where they are. The rest are placed highest priority first (then by current
 * start), never earlier than they are now (or `now`); anything that no longer fits is
 * pushed later, into the next shift if need be. A job nothing fits is reported with fit=false.
 */
export function reflowJobs(a: { shift: Shift; fixed: Block[]; jobs: Block[]; origin: Origin | null; now: number }): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const placed: Block[] = [...a.fixed];
  for (const job of a.jobs.filter((j) => j.pinned)) {
    out.set(job.id, { start: job.start, end: job.end, travel: 0, fit: true });
    placed.push(job);
  }
  const rest = a.jobs.filter((j) => !j.pinned).sort((x, y) => (y.rank ?? 0) - (x.rank ?? 0) || x.start - y.start || x.id.localeCompare(y.id));
  for (const job of rest) {
    const slot = earliestStart({
      shift: a.shift,
      blocks: placed,
      origin: a.origin,
      target: job.loc,
      durationMin: Math.round((job.end - job.start) / MIN),
      notBefore: Math.max(a.now, job.start),
      emergency: (job.rank ?? 0) >= EMERGENCY_RANK,
    });
    const next: Placement = slot ? { ...slot, fit: true } : { start: job.start, end: job.end, travel: 0, fit: false };
    out.set(job.id, next);
    placed.push({ ...job, start: next.start, end: next.end });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Priority score, higher is better. Weights (points):
 *   skill match   30  x share of the required skills the person covers
 *   proximity     20  x (1 - travel/30 min), from where they are now or finished last
 *   timeliness    25  x severity factor x me-too factor, how soon they can start vs the SLA
 *                     (start at "now" = full marks; at the due time = half; late decays to 0 in a day)
 *   workload      10  x (1 - open jobs / max active jobs)
 *   on call        5  extra for on-call staff on an Emergency
 *   bumping       -4  per lower-priority job an Emergency would push back
 * Severity factor: LOW 0.6, STANDARD 1, URGENT 1.4, EMERGENCY 1.8 (urgent jobs care more about
 * speed). Me-too factor: +4% per student who has the same problem (max +40%).
 */
export const WEIGHTS = { skill: 30, proximity: 20, timeliness: 25, workload: 10, onCall: 5, bump: 4 } as const;
export const SEVERITY_FACTOR: Record<Severity, number> = { LOW: 0.6, STANDARD: 1, URGENT: 1.4, EMERGENCY: 1.8 };

export type ScoreInput = {
  coverage: number;
  travelMin: number;
  start: number;
  now: number;
  due: number;
  severity: Severity;
  meToo: number;
  openJobs: number;
  maxJobs: number;
  onCallOnEmergency: boolean;
  displaced: number;
};

export function scoreCandidate(i: ScoreInput): number {
  const skill = WEIGHTS.skill * i.coverage;
  const proximity = WEIGHTS.proximity * Math.max(0, 1 - i.travelMin / 30);
  const window = Math.max(i.due - i.now, 15 * MIN);
  const wait = Math.max(0, i.start - i.now);
  const base = i.start <= i.due ? 1 - 0.5 * Math.min(1, wait / window) : 0.5 * Math.max(0, 1 - (i.start - i.due) / DAY_MS);
  const urgency = SEVERITY_FACTOR[i.severity] * (1 + Math.min(i.meToo, 10) * 0.04);
  const timeliness = WEIGHTS.timeliness * base * urgency;
  const workload = WEIGHTS.workload * Math.max(0, 1 - i.openJobs / Math.max(1, i.maxJobs));
  const onCall = i.onCallOnEmergency ? WEIGHTS.onCall : 0;
  const score = skill + proximity + timeliness + workload + onCall - WEIGHTS.bump * i.displaced;
  return Math.round(score * 10) / 10;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type EngineTicket = {
  id: string;
  number: number;
  loc: LatLng;
  severity: Severity;
  requiredSkills: Skill[];
  estimatedMinutes: number;
  responseDueAt: Date;
  meTooCount: number;
};

/** A contractor who already passed hard eligibility (credentials, department, access, capacity). */
export type EngineCandidate = {
  userId: string;
  name: string;
  shift: Shift;
  skills: Skill[];
  blocks: Block[];
  origin: Origin | null;
  openJobs: number;
  maxJobs: number;
};

export type Evaluation = {
  candidate: EngineCandidate;
  covered: Skill[];
  missing: Skill[];
  slot: Slot;
  score: number;
  reasons: string;
};

export type PlanMember = { evaluation: Evaluation; role: "PRIMARY" | "HELPER"; start: number; end: number; travel: number; reasons: string };
export type Plan = { members: PlanMember[]; ranked: Evaluation[] };

const labelList = (s: Skill[]) => s.map((k) => SKILL_LABEL[k]).join(" + ");

function whenLabel(start: number, now: number): string {
  return `${formatClock(start)}${campusDayStart(start) === campusDayStart(now) ? "" : ` ${formatDay(start)}`}`;
}

export function describe(e: { covered: Skill[]; missing: Skill[]; slot: Slot; candidate: EngineCandidate }, now: number, extra: string[] = []): string {
  const parts: string[] = [];
  if (e.covered.length) parts.push(`${labelList(e.covered)} ✓`);
  if (e.missing.length) parts.push(`missing ${labelList(e.missing)}`);
  parts.push(e.candidate.origin?.loc ? `${e.slot.travel} min away` : "location unknown");
  parts.push(`${e.slot.start <= now + MIN ? "free now" : `free at ${whenLabel(e.slot.start, now)}`}`);
  parts.push(`${e.candidate.openJobs} open job${e.candidate.openJobs === 1 ? "" : "s"}`);
  if (e.slot.displaced.length) parts.push(`pushes back ${e.slot.displaced.map((d) => (d.ticketNumber ? `RR-${d.ticketNumber}` : "a job")).join(", ")}`);
  return [...parts, ...extra].join(" · ");
}

export function evaluate(t: EngineTicket, c: EngineCandidate, now: number, notBefore = now, required = t.requiredSkills): Evaluation | null {
  const rank = SEVERITY_RANK[t.severity];
  const slot = bestSlot({ shift: c.shift, blocks: c.blocks, origin: c.origin, target: t.loc, durationMin: t.estimatedMinutes, notBefore, rank });
  if (!slot) return null;
  const covered = required.filter((s) => c.skills.includes(s));
  const missing = required.filter((s) => !c.skills.includes(s));
  const outside = t.severity === "EMERGENCY" && c.shift.onCall;
  const score = scoreCandidate({
    coverage: required.length ? covered.length / required.length : 1,
    travelMin: slot.travel,
    start: slot.start,
    now,
    due: t.responseDueAt.getTime(),
    severity: t.severity,
    meToo: t.meTooCount,
    openJobs: c.openJobs,
    maxJobs: c.maxJobs,
    onCallOnEmergency: outside,
    displaced: slot.displaced.length,
  });
  const e = { candidate: c, covered, missing, slot, score, reasons: "" };
  e.reasons = describe(e, now, outside ? ["on call"] : []);
  return e;
}

/** Everyone who can take the ticket, best first. A full skill match always outranks a partial one. */
export function rankCandidates(t: EngineTicket, candidates: EngineCandidate[], now: number): Evaluation[] {
  return candidates
    .map((c) => evaluate(t, c, now))
    .filter((e): e is Evaluation => !!e)
    .sort((a, b) => Number(a.missing.length > 0) - Number(b.missing.length > 0) || b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
}

/** Everyone who can take at least part of the ticket, best first (what planAssignment chooses from). */
export function rankPlannable(t: EngineTicket, candidates: EngineCandidate[], now: number): Evaluation[] {
  return rankCandidates(t, candidates, now).filter((e) => e.covered.length > 0 || !t.requiredSkills.length);
}

/** How long an Emergency's primary may wait for skill helpers, and how far a backup may start after the primary. */
export const EMERGENCY_WAIT_MINUTES = 30;

type Pick = { ev: Evaluation; role: "PRIMARY" | "HELPER"; note?: string };
type Aligned = Pick & { start: number; end: number; travel: number };

const asAligned = (p: Pick): Aligned => ({ ...p, start: p.ev.slot.start, end: p.ev.slot.end, travel: p.ev.slot.travel });

/** Slide primary and skill helpers to a shared start, re-checking calendars. Null if it doesn't converge. */
function alignTogether(t: EngineTicket, picks: Pick[]): Aligned[] | null {
  let members = picks.map(asAligned);
  let joint = Math.max(...members.map((m) => m.start));
  for (let i = 0; i < 6 && members.some((m) => m.start !== joint); i++) {
    const next: Aligned[] = [];
    for (const m of members) {
      if (m.start === joint) {
        next.push(m);
        continue;
      }
      const slot = bestSlot({ shift: m.ev.candidate.shift, blocks: m.ev.candidate.blocks, origin: m.ev.candidate.origin, target: t.loc, durationMin: t.estimatedMinutes, notBefore: joint, rank: SEVERITY_RANK[t.severity] });
      if (slot) next.push({ ...m, start: slot.start, end: slot.end, travel: slot.travel, ev: { ...m.ev, slot } });
      else if (m.role === "PRIMARY") return null;
    }
    members = next;
    joint = Math.max(...members.map((m) => m.start));
  }
  return members.every((m) => m.start === joint) && members.some((m) => m.role === "PRIMARY") ? members : null;
}

/**
 * Pick the primary (a full skill match if anyone has one), then helpers who cover what's
 * still missing, then, for Emergencies, one backup. Primary and skill helpers share a start
 * time, except that an Emergency never waits more than EMERGENCY_WAIT_MINUTES for them: then
 * the primary goes at once and helpers come at their own earliest slot. A backup never
 * delays anyone; it keeps its own slot or is dropped if that is too late to be a backup.
 */
export function planAssignment(t: EngineTicket, candidates: EngineCandidate[], now: number): Plan | null {
  const ranked = rankPlannable(t, candidates, now);
  if (!ranked.length) return null;
  const primary = ranked[0];
  const emergency = t.severity === "EMERGENCY";
  const picks: Pick[] = [{ ev: primary, role: "PRIMARY" }];

  let missing = primary.missing;
  const pool = ranked.slice(1);
  while (missing.length) {
    const best = pool
      .filter((e) => !picks.some((p) => p.ev === e) && e.candidate.skills.some((s) => missing.includes(s)))
      .map((e) => ({ e, gain: missing.filter((s) => e.candidate.skills.includes(s)).length }))
      .sort((a, b) => b.gain - a.gain || b.e.score - a.e.score)[0];
    if (!best) break;
    picks.push({ ev: best.e, role: "HELPER", note: `helps with ${labelList(missing.filter((s) => best.e.candidate.skills.includes(s)))}` });
    missing = missing.filter((s) => !best.e.candidate.skills.includes(s));
  }

  const own = picks.map(asAligned);
  const waitCap = EMERGENCY_WAIT_MINUTES * MIN;
  let members: Aligned[];
  if (picks.length === 1) members = own;
  else {
    const aligned = alignTogether(t, picks);
    if (emergency) {
      const tooLate = !aligned || Math.max(...aligned.map((m) => m.start)) - primary.slot.start > waitCap;
      members = tooLate ? own : aligned;
    } else {
      // Not converged: keep the primary where it is and only the helpers that already start with it.
      members = aligned ?? [own[0], ...own.slice(1).filter((m) => m.start === own[0].start)];
    }
  }

  if (emergency && picks.length < 2) {
    const backup = pool.find((e) => !picks.some((p) => p.ev === e));
    const primaryStart = members[0].start;
    if (backup && backup.slot.start <= primaryStart + waitCap) members.push({ ev: backup, role: "HELPER", note: "backup", start: backup.slot.start, end: backup.slot.end, travel: backup.slot.travel });
  }

  return {
    ranked,
    members: members.map((m) => ({
      evaluation: m.ev,
      role: m.role,
      start: m.start,
      end: m.end,
      travel: m.travel,
      reasons: describe(m.ev, now, [...(emergency && m.ev.candidate.shift.onCall ? ["on call"] : []), ...(m.note ? [m.note] : [])]),
    })),
  };
}
