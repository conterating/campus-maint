// Administrator analytics. Pure functions over plain ticket rows, so they're
// easy to test; src/app/admin/page.tsx loads the rows and renders the results.
import { DEPARTMENTS, isOpenStatus, type Department } from "./domain";
import { isOverdue, metResponseTarget } from "./sla";

export type AnalyticsTicket = {
  id: string;
  number: number;
  summary: string;
  category: string;
  department: string;
  status: string;
  buildingId: string;
  buildingName: string;
  spaceId: string | null;
  spaceLabel: string | null;
  assetId: string | null;
  assetName: string | null;
  createdAt: Date;
  responseDueAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  escalatedAt: Date | null;
  meTooCount: number;
};

const HOUR = 3_600_000;

export function issuesByBuilding(tickets: AnalyticsTicket[]) {
  const map = new Map<string, { buildingId: string; name: string; total: number; open: number }>();
  for (const t of tickets) {
    const row = map.get(t.buildingId) ?? { buildingId: t.buildingId, name: t.buildingName, total: 0, open: 0 };
    row.total++;
    if (isOpenStatus(t.status)) row.open++;
    map.set(t.buildingId, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type RecurringProblem = {
  key: string;
  label: string;
  where: string;
  category: string;
  count: number;
  openNow: number;
  lastReported: Date;
  ticketIds: string[];
};

/**
 * The same equipment, or the same kind of problem in the same room, reported
 * `minCount`+ times within `windowDays`. Equipment-level groups take precedence.
 */
export function recurringProblems(tickets: AnalyticsTicket[], now: Date, windowDays = 90, minCount = 3): RecurringProblem[] {
  const since = now.getTime() - windowDays * 24 * HOUR;
  const recent = tickets.filter((t) => t.createdAt.getTime() >= since);
  const groups = new Map<string, AnalyticsTicket[]>();
  for (const t of recent) {
    const key = t.assetId ? `asset:${t.assetId}` : t.spaceId ? `space:${t.spaceId}:${t.category}` : `building:${t.buildingId}:${t.category}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: RecurringProblem[] = [];
  for (const [key, list] of groups) {
    if (list.length < minCount) continue;
    const t = list[0];
    out.push({
      key,
      label: t.assetName ?? t.spaceLabel ?? t.buildingName,
      where: [t.buildingName, t.assetName ? t.spaceLabel : null].filter(Boolean).join(" · "),
      category: t.category,
      count: list.length,
      openNow: list.filter((x) => isOpenStatus(x.status)).length,
      lastReported: new Date(Math.max(...list.map((x) => x.createdAt.getTime()))),
      ticketIds: list.map((x) => x.id),
    });
  }
  return out.sort((a, b) => b.count - a.count || b.lastReported.getTime() - a.lastReported.getTime());
}

/** Mean hours from report to "resolved", per department, over tickets that have been resolved. */
export function avgResolutionHours(tickets: AnalyticsTicket[]) {
  return DEPARTMENTS.map((d) => {
    const done = tickets.filter((t) => t.department === d && t.resolvedAt);
    const hours = done.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / HOUR);
    return { department: d as Department, resolved: done.length, avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null };
  });
}

/**
 * Share of tickets that got a first response within target. Tickets still inside
 * their window (not yet responded, not yet late) are excluded: they haven't met
 * or missed anything yet.
 */
export function responseTargetShare(tickets: AnalyticsTicket[], now: Date) {
  const judge = (list: AnalyticsTicket[]) => {
    let met = 0;
    let missed = 0;
    for (const t of list) {
      const r = metResponseTarget({ ...t }, now);
      if (r === true) met++;
      else if (r === false) missed++;
    }
    const total = met + missed;
    return { met, missed, total, share: total ? met / total : null };
  };
  return {
    overall: judge(tickets),
    byDepartment: DEPARTMENTS.map((d) => ({ department: d as Department, ...judge(tickets.filter((t) => t.department === d)) })),
  };
}

export function headline(tickets: AnalyticsTicket[], now: Date) {
  const open = tickets.filter((t) => isOpenStatus(t.status));
  const responded = tickets.filter((t) => t.firstResponseAt);
  const firstResponseHours = responded.map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / HOUR).sort((a, b) => a - b);
  const median = firstResponseHours.length ? firstResponseHours[Math.floor(firstResponseHours.length / 2)] : null;
  return {
    total: tickets.length,
    open: open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    escalated: tickets.filter((t) => t.escalatedAt).length,
    medianFirstResponseHours: median,
    meToos: tickets.reduce((s, t) => s + t.meTooCount, 0),
  };
}

export function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hr`;
  return `${(h / 24).toFixed(1)} days`;
}
