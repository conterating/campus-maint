import Link from "next/link";
import { Coffee, Footprints } from "lucide-react";
import { SeverityBadge } from "@/components/badges";
import { formatClock } from "@/lib/scheduling/time";
import { formatTicketNumber } from "@/lib/domain";
import type { DayItem } from "@/lib/scheduling/service";

const MIN = 60_000;

/** A day's jobs and breaks in time order, with the walking gap between jobs. */
export function ScheduleTimeline({ items, now, detailed = false, linkJobs = true }: { items: DayItem[]; now: number; detailed?: boolean; linkJobs?: boolean }) {
  if (!items.length) return <p className="py-6 text-ink-3">Nothing scheduled.</p>;
  return (
    <ol className="border-t border-line-2">
      {items.map((it) => {
        const live = it.start <= now && it.end > now;
        const past = it.end <= now;
        const time = (
          <div className="w-20 shrink-0 pt-0.5 sm:w-28">
            <p className={`num text-[1.0625rem] ${past ? "text-ink-3" : "text-navy"}`}>{formatClock(it.start)}</p>
            <p className="num text-sm text-ink-3">to {formatClock(it.end)}</p>
          </div>
        );
        if (it.kind === "BREAK") {
          return (
            <li key={it.id} className={`flex gap-4 border-b border-line px-1 py-3`}>
              {time}
              <p className="flex items-center gap-2 border-l-2 border-dashed border-line-2 pl-4 font-bold text-ink-2">
                <Coffee aria-hidden className="size-4 text-ink-3" /> {it.reason ?? "Break"} <span className="font-normal text-ink-3">{Math.round((it.end - it.start) / MIN)} min</span>
              </p>
            </li>
          );
        }
        return (
          <li key={it.id} className={`border-b border-line px-1 py-3`}>
            {it.travel > 0 && (
              <p className="mb-2 flex items-center gap-1.5 pl-[6.5rem] text-sm text-ink-3 max-sm:pl-24">
                <Footprints aria-hidden className="size-3.5" /> <span className="num">{it.travel}</span> min travel
              </p>
            )}
            <div className="flex gap-4">
              {time}
              <div className={`min-w-0 flex-1 border-l-[3px] pl-4 ${live ? "border-gold" : it.severity === "EMERGENCY" ? "border-emergency" : "border-navy"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {linkJobs ? (
                    <Link href={`/tickets/${it.ticketId}`} className="num text-[1.0625rem] text-navy underline-offset-2 hover:underline">
                      {formatTicketNumber(it.number)}
                    </Link>
                  ) : (
                    <span className="num text-[1.0625rem] text-navy">{formatTicketNumber(it.number)}</span>
                  )}
                  <SeverityBadge severity={it.severity} size="sm" />
                  <span className="wo-label">{it.role === "HELPER" ? "Helper" : "Primary"}</span>
                  {live && <span className="wo-label text-navy">Now</span>}
                  {it.status === "DONE" && <span className="wo-label">Done</span>}
                </div>
                <p className="mt-0.5 font-bold text-ink">{it.summary}</p>
                <p className="text-sm text-ink-2">{it.where}</p>
                {detailed && it.reasons && (
                  <p className="mt-1 text-sm text-ink-3">
                    Score <span className="num">{it.score.toFixed(1)}</span> · {it.reasons}
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
