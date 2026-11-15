// The repair tracker: four plain-language stages a student actually cares about,
// drawn as work-order status tiles. Staff still see the precise status elsewhere.
import { Check, CircleDashed, RefreshCw, RotateCcw, UserCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export const STAGES = ["Reported", "Assigned", "In progress", "Fixed"] as const;

export function stageIndex(status: string): number {
  switch (status) {
    case "ASSIGNED":
      return 1;
    case "IN_PROGRESS":
    case "REOPENED":
      return 2;
    case "RESOLVED":
    case "CONFIRMED":
      return 3;
    default:
      return 0;
  }
}

/** One line under the tracker saying where things stand, in words. */
export function stageCaption(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Waiting to be sorted";
    case "TRIAGED":
      return "Sorted and waiting for a technician";
    case "ASSIGNED":
      return "A technician has it";
    case "IN_PROGRESS":
      return "Being worked on";
    case "REOPENED":
      return "Reopened: still broken";
    case "RESOLVED":
      return "Marked fixed: waiting for confirmation";
    case "CONFIRMED":
      return "Fixed and confirmed";
    default:
      return "";
  }
}

type Stamp = Date | null | undefined;

/** When each stage was reached, from the ticket's status events. */
export function stageStamps(createdAt: Date, events: { type: string; toStatus: string | null; createdAt: Date }[]): Stamp[] {
  const last = (...statuses: string[]) =>
    events
      .filter((e) => e.type === "STATUS" && e.toStatus && statuses.includes(e.toStatus))
      .reduce<Date | null>((acc, e) => (!acc || e.createdAt > acc ? e.createdAt : acc), null);
  return [createdAt, last("ASSIGNED"), last("IN_PROGRESS", "REOPENED"), last("RESOLVED", "CONFIRMED")];
}

const STAGE_ICONS = [CircleDashed, UserCheck, RefreshCw, Check] as const;

/** Four status tiles, work-order style: done ones tinted, the current one solid. */
export function Progress({ status, stamps = [] }: { status: string; stamps?: Stamp[] }) {
  const current = stageIndex(status);
  const complete = status === "CONFIRMED";
  const reopened = status === "REOPENED";
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Repair progress">
      {STAGES.map((label, i) => {
        const done = i < current || (i === current && complete);
        const isCurrent = i === current;
        const reached = i <= current;
        const stamp = reached ? stamps[i] : null;
        const name = i === 2 && reopened ? "Reopened" : label;
        const Icon = i === 2 && reopened ? RotateCcw : STAGE_ICONS[i];
        const tone =
          isCurrent && !complete
            ? reopened
              ? "border-[var(--st-reopened)] bg-[var(--st-reopened)] text-white"
              : "border-navy bg-navy text-white"
            : reached
              ? "border-navy-100 bg-navy-50 text-navy"
              : "border-line bg-surface text-ink-3";
        return (
          <li key={label} className={`min-w-0 rounded-[8px] border px-1.5 py-2.5 text-center ${tone}`} aria-current={isCurrent ? "step" : undefined}>
            <Icon aria-hidden className="mx-auto size-[1.125rem]" strokeWidth={2.2} />
            <p className="mt-1 truncate text-[0.8125rem] font-semibold leading-tight">
              {name}
              <span className="sr-only">{isCurrent ? " (current)" : done || reached ? " (done)" : " (not yet)"}</span>
            </p>
            {stamp && (
              <p className={`mt-0.5 hidden truncate text-[0.6875rem] sm:block ${isCurrent && !complete ? "text-white/80" : "text-ink-3"}`}>
                <time dateTime={stamp.toISOString()}>{formatDateTime(stamp)}</time>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Four thin segments for list cards. Decorative: the caption beside it carries the meaning. */
export function ProgressBar({ status }: { status: string }) {
  const current = stageIndex(status);
  const color = status === "REOPENED" ? "var(--st-reopened)" : status === "CONFIRMED" || status === "RESOLVED" ? "var(--st-resolved)" : "var(--navy)";
  return (
    <span aria-hidden className="grid w-full grid-cols-4 gap-1">
      {STAGES.map((s, i) => (
        <span key={s} className="h-1.5 rounded-full" style={{ background: i <= current ? color : "var(--line)" }} />
      ))}
    </span>
  );
}
