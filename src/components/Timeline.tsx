import { AlertOctagon, ArrowRightLeft, Check, CircleDot, Lock, MessageSquare, PencilLine, RotateCcw, TrendingUp, Users } from "lucide-react";
import { STATUS_LABEL, type Status } from "@/lib/domain";
import { formatDateTime, relativeTime } from "@/lib/format";
import { STATUS_COLOR } from "./badges";

type Event = {
  id: string;
  type: string;
  toStatus: string | null;
  message: string;
  internal: boolean;
  createdAt: Date;
  actorLabel: string | null;
};

function iconFor(e: Event) {
  if (e.type === "STATUS") {
    if (e.toStatus === "REOPENED") return { Icon: RotateCcw, color: STATUS_COLOR.REOPENED };
    if (e.toStatus === "RESOLVED" || e.toStatus === "CONFIRMED") return { Icon: Check, color: STATUS_COLOR[e.toStatus as Status] };
    return { Icon: CircleDot, color: STATUS_COLOR[(e.toStatus as Status) ?? "SUBMITTED"] ?? "var(--ink-3)" };
  }
  switch (e.type) {
    case "NOTE":
      return { Icon: e.internal ? Lock : MessageSquare, color: e.internal ? "var(--gold-ink)" : "var(--navy)" };
    case "ESCALATED":
      return { Icon: AlertOctagon, color: "var(--sev-emergency)" };
    case "REASSIGN":
      return { Icon: ArrowRightLeft, color: "var(--navy)" };
    case "OVERRIDE":
      return { Icon: PencilLine, color: "var(--navy)" };
    case "METOO":
      return { Icon: Users, color: "var(--ink-3)" };
    case "PRIORITY":
      return { Icon: TrendingUp, color: "var(--sev-urgent)" };
    default:
      return { Icon: CircleDot, color: "var(--ink-3)" };
  }
}

export function Timeline({ events, now }: { events: Event[]; now: Date }) {
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => {
        const { color } = iconFor(e);
        const note = e.type === "NOTE";
        const status = e.type === "STATUS" && e.toStatus ? STATUS_LABEL[e.toStatus as Status] : null;
        return (
          <li key={e.id} className="grid grid-cols-1 gap-x-5 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <p className="text-[0.8125rem] tabular-nums text-ink-3 sm:pt-0.5">
              <time dateTime={e.createdAt.toISOString()} title={relativeTime(e.createdAt, now)}>
                {formatDateTime(e.createdAt)}
              </time>
            </p>
            <div className="min-w-0">
              {note ? (
                <div className={e.internal ? "border-l-[3px] border-tech-gold bg-buzz-50 px-3 py-2" : "border-l-[3px] border-navy bg-panel px-3 py-2"}>
                  {e.internal && <p className="mb-0.5 text-xs font-bold text-gold-ink">Internal note · hidden from students</p>}
                  <p className="leading-snug text-ink">{e.message}</p>
                </div>
              ) : (
                <p className="leading-snug text-ink-2">
                  {status && (
                    <span className="mr-1.5 font-bold" style={{ color }}>
                      {status}
                    </span>
                  )}
                  <span className={e.type === "ESCALATED" ? "font-bold text-emergency" : ""}>{status ? e.message.replace(new RegExp(`^${status} — `), "") : e.message}</span>
                </p>
              )}
              {e.actorLabel && <p className="mt-1 text-[0.8125rem] text-ink-3">{e.actorLabel}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
