// Break rules. Pure.
import { MIN } from "./time";

export const MAX_BREAK_MINUTES = 240;
export const MAX_BREAKS_PER_DAY = 10;

type Span = { start: number; end: number };

/** Why a proposed break isn't allowed, or null. Times are ms. */
export function breakProblem(a: { start: number; end: number; now: number; existing: Span[]; inProgress: Span[]; sameDayCount: number }): string | null {
  if (!Number.isFinite(a.start) || !Number.isFinite(a.end)) return "Choose a start time and length for the break.";
  if (a.end <= a.start) return "The break has to end after it starts.";
  if (a.end - a.start > MAX_BREAK_MINUTES * MIN) return `Breaks can be at most ${MAX_BREAK_MINUTES / 60} hours.`;
  if (a.end <= a.now) return "That break is already over.";
  if (a.sameDayCount >= MAX_BREAKS_PER_DAY) return `You can add up to ${MAX_BREAKS_PER_DAY} breaks a day.`;
  if (a.existing.some((b) => a.start < b.end && a.end > b.start)) return "That overlaps another break.";
  if (a.inProgress.some((j) => a.start < j.end && a.end > j.start)) return "You're in the middle of a job then. Finish it first, or pick another time.";
  return null;
}
