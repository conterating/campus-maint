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
    <ol>
      {events.map((e, i) => {
        const { Icon, color } = iconFor(e);
        const last = i === events.length - 1;
        const note = e.type === "NOTE";
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-line" />}
            <span
              aria-hidden
              className="relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
              style={{ color, background: `color-mix(in srgb, ${color} 10%, white)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 25%, white)` }}
            >
              <Icon className="size-3.5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              {note ? (
                <div className={`rounded-[10px] px-3 py-2 ${e.internal ? "border border-dashed border-tech-gold bg-buzz-50" : "border border-line bg-surface-2"}`}>
                  {e.internal && <p className="eyebrow mb-0.5 !text-gold-ink">Internal note</p>}
                  <p className="leading-snug text-ink">{e.message}</p>
                </div>
              ) : (
                <p className="leading-snug text-ink-2">
                  {e.type === "STATUS" && e.toStatus && <span className="font-bold text-ink">{STATUS_LABEL[e.toStatus as Status]}: </span>}
                  <span className={e.type === "ESCALATED" ? "font-bold text-emergency" : ""}>
                    {e.type === "STATUS" && e.toStatus ? e.message.replace(new RegExp(`^${STATUS_LABEL[e.toStatus as Status]} — `), "") : e.message}
                  </span>
                </p>
              )}
              <p className="mt-1 text-[0.8125rem] text-ink-3">
                {e.actorLabel && <>{e.actorLabel} · </>}
                <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)}>
                  {relativeTime(e.createdAt, now)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
