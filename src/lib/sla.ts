// Response-time targets. Pure functions: every caller passes `now` explicitly so
// the demo clock and tests stay in control of time.
import { APP_CONFIG } from "@/config/app";
import { isOpenStatus, SEVERITIES, SEVERITY_RANK, type Severity } from "./domain";

const HOUR = 60 * 60 * 1000;

export function responseTargetMs(severity: Severity): number {
  return APP_CONFIG.responseTargetHours[severity] * HOUR;
}

export function responseDueAt(from: Date, severity: Severity): Date {
  return new Date(from.getTime() + responseTargetMs(severity));
}

type SlaTicket = {
  status: string;
  responseDueAt: Date;
  firstResponseAt: Date | null;
};

/** Is the response clock still running for this ticket? */
export function awaitingFirstResponse(t: SlaTicket): boolean {
  return t.firstResponseAt === null && isOpenStatus(t.status);
}

export function isOverdue(t: SlaTicket, now: Date): boolean {
  return awaitingFirstResponse(t) && t.responseDueAt.getTime() < now.getTime();
}

/** Milliseconds until the response target; negative when overdue; null when the clock has stopped. */
export function msRemaining(t: SlaTicket, now: Date): number | null {
  if (!awaitingFirstResponse(t)) return null;
  return t.responseDueAt.getTime() - now.getTime();
}

/** Did staff respond within the target? null when the ticket is still waiting and not yet late. */
export function metResponseTarget(t: SlaTicket & { createdAt: Date }, now: Date): boolean | null {
  if (t.firstResponseAt) return t.firstResponseAt.getTime() <= t.responseDueAt.getTime();
  if (t.responseDueAt.getTime() < now.getTime()) return false;
  return null;
}

/** "3h 12m", "2d 4h", "45m" — compact, always positive. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return m ? `${hours}h ${m}m` : `${hours}h`;
  return `${Math.max(m, abs > 0 ? 1 : 0)}m`;
}

/** Severity one level up, capped at Urgent. Emergency is reserved for safety reports. */
export function raisedSeverity(s: Severity): Severity {
  if (s === "LOW") return "STANDARD";
  if (s === "STANDARD") return "URGENT";
  return s;
}

/**
 * Queue order: Emergency first, then by severity, then least time remaining
 * (overdue tickets have negative time and float up), then most "me too"s.
 */
export function compareQueue(
  a: SlaTicket & { severity: string; meTooCount: number; createdAt: Date },
  b: SlaTicket & { severity: string; meTooCount: number; createdAt: Date },
  now: Date,
): number {
  const sa = SEVERITY_RANK[a.severity as Severity] ?? 0;
  const sb = SEVERITY_RANK[b.severity as Severity] ?? 0;
  if (sa !== sb) return sb - sa;
  const ra = msRemaining(a, now) ?? Number.POSITIVE_INFINITY;
  const rb = msRemaining(b, now) ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  if (a.meTooCount !== b.meTooCount) return b.meTooCount - a.meTooCount;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export { SEVERITIES };
