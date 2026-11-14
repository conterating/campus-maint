// The repair tracker: four plain-language stages a student actually cares about,
// drawn like a delivery tracker. Staff still see the precise status elsewhere.
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

export function Progress({ status, stamps = [] }: { status: string; stamps?: Stamp[] }) {
  const current = stageIndex(status);
  const complete = status === "CONFIRMED";
  const reopened = status === "REOPENED";
  const accent = reopened ? "var(--st-reopened)" : "var(--navy)";
  return (
    <ol className="grid grid-cols-4" aria-label="Repair progress">
      {STAGES.map((label, i) => {
        const done = i < current || (i === current && complete);
        const isCurrent = i === current;
        const reached = i <= current;
        const stamp = reached ? stamps[i] : null;
        const name = i === 2 && reopened ? "Reopened" : label;
        return (
          <li key={label} className="relative min-w-0 pr-2" aria-current={isCurrent ? "step" : undefined}>
            <div className="flex items-center" aria-hidden>
              <span
                className="relative z-10 grid size-[1.375rem] shrink-0 place-items-center rounded-full"
                style={{
                  background: reached ? accent : "var(--surface)",
                  boxShadow: reached
                    ? isCurrent && !complete
                      ? `0 0 0 4px color-mix(in srgb, ${accent} 16%, transparent)`
                      : "none"
                    : "inset 0 0 0 2px var(--line-2)",
                }}
              >
                {done && (
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                )}
                {isCurrent && !done && <span className="size-2 rounded-full bg-white" />}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className="mx-1.5 h-[3px] flex-1 rounded-full"
                  style={{ background: i < current ? accent : "repeating-linear-gradient(90deg, var(--line-2) 0 5px, transparent 5px 9px)" }}
                />
              )}
            </div>
            <p className={`mt-2 text-[0.8125rem] leading-tight sm:text-sm ${isCurrent ? "font-bold text-ink" : reached ? "text-ink-2" : "text-ink-3"}`} style={isCurrent && reopened ? { color: accent } : undefined}>
              {name}
              <span className="sr-only">{isCurrent ? " (current)" : done || reached ? " (done)" : " (not yet)"}</span>
            </p>
            {stamp && (
              <p className="mt-0.5 hidden text-xs text-ink-3 sm:block">
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
