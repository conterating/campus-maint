// The repair tracker: four plain-language stages a student actually cares about,
// drawn like a package tracker. Staff still see the precise status elsewhere.
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

/**
 * The tracker: a package-tracking line from Reported to Fixed. Segments fill
 * one after another up to the current stop on load (~600ms total). Vertical on
 * phones, horizontal from `sm`. Progress uses the navy scale; Fixed is green;
 * Reopened is dark gold. `notes` adds a line under a stop (e.g. the technician).
 */
export function Progress({ status, stamps = [], notes = [] }: { status: string; stamps?: Stamp[]; notes?: (string | null | undefined)[] }) {
  const current = stageIndex(status);
  const complete = status === "CONFIRMED";
  const fixed = status === "RESOLVED" || complete;
  const reopened = status === "REOPENED";
  const accent = fixed ? "var(--st-fixed)" : reopened ? "var(--st-reopened)" : "var(--st-progress)";
  const SEG_MS = 190;
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-4" aria-label="Repair progress">
      {STAGES.map((label, i) => {
        const done = i < current || (i === current && complete);
        const isCurrent = i === current;
        const reached = i <= current;
        const stamp = reached ? stamps[i] : null;
        const name = i === 2 && reopened ? "Reopened" : label;
        const note = reached ? notes[i] : null;
        return (
          <li key={label} className="relative flex gap-4 pb-8 last:pb-0 sm:block sm:pb-0 sm:pr-3" aria-current={isCurrent ? "step" : undefined}>
            {i < STAGES.length - 1 && (
              <span aria-hidden className="absolute bottom-1 left-[14px] top-9 w-1 rounded-full bg-line sm:left-10 sm:right-2 sm:top-[14px] sm:bottom-auto sm:h-1 sm:w-auto">
                {i < current && <span className="wo-track-fill block size-full rounded-full" style={{ background: accent, animationDelay: `${120 + i * SEG_MS}ms`, animationDuration: `${SEG_MS}ms` }} />}
              </span>
            )}
            <span
              aria-hidden
              className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ${reached ? "anim-stop" : ""}`}
              style={{
                animationDelay: reached ? `${100 + i * SEG_MS}ms` : undefined,
                background: done ? accent : "var(--surface)",
                boxShadow: done ? "none" : isCurrent ? `inset 0 0 0 4px ${accent}` : "inset 0 0 0 2px var(--line-2)",
              }}
            >
              {done ? (
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              ) : isCurrent ? (
                <span className="size-2.5 rounded-full" style={{ background: accent }} />
              ) : null}
            </span>
            <div className="min-w-0 sm:mt-3">
              <p
                className={`font-display text-[1.375rem] font-bold uppercase leading-none tracking-[0.01em] sm:text-[1.5rem] ${isCurrent ? "" : reached ? "text-ink" : "text-ink-3"}`}
                style={isCurrent ? { color: accent } : undefined}
              >
                {name}
                <span className="sr-only">{isCurrent ? " (current)" : done || reached ? " (done)" : " (not yet)"}</span>
              </p>
              {stamp && (
                <p className="num mt-1 text-[0.9375rem] font-semibold text-ink-3">
                  <time dateTime={stamp.toISOString()}>{formatDateTime(stamp)}</time>
                </p>
              )}
              {note && <p className="mt-0.5 text-[0.9375rem] font-bold text-ink-2">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
