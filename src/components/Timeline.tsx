import { AlertOctagon, ArrowRightLeft, Check, CircleDot, Lock, MessageCircle, MessageSquare, PencilLine, RotateCcw, TrendingUp, Users } from "lucide-react";
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
  /** COMMENT only. */
  photos?: string[];
};

function CommentPhotos({ photos }: { photos: string[] }) {
  return (
    <ul className={`mt-2 grid gap-2 ${photos.length === 1 ? "grid-cols-1 sm:max-w-xs" : "grid-cols-3"}`}>
      {photos.map((src, i) => (
        <li key={src}>
          <a href={src} target="_blank" rel="noopener" className="block overflow-hidden rounded-[8px] ring-1 ring-line hover:ring-navy">
            {/* eslint-disable-next-line @next/next/no-img-element -- user upload served by our route */}
            <img
              src={src}
              alt={photos.length === 1 ? "Photo attached to this comment (opens full size)" : `Photo ${i + 1} of ${photos.length} attached to this comment (opens full size)`}
              loading="lazy"
              className={`w-full bg-bg object-cover ${photos.length === 1 ? "max-h-56" : "aspect-square"}`}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

function iconFor(e: Event) {
  if (e.type === "STATUS") {
    if (e.toStatus === "REOPENED") return { Icon: RotateCcw, color: STATUS_COLOR.REOPENED };
    if (e.toStatus === "RESOLVED" || e.toStatus === "CONFIRMED") return { Icon: Check, color: STATUS_COLOR[e.toStatus as Status] };
    return { Icon: CircleDot, color: STATUS_COLOR[(e.toStatus as Status) ?? "SUBMITTED"] ?? "var(--ink-3)" };
  }
  switch (e.type) {
    case "NOTE":
      return { Icon: e.internal ? Lock : MessageSquare, color: e.internal ? "var(--gold-ink)" : "var(--navy)" };
    case "COMMENT":
      return { Icon: MessageCircle, color: "var(--navy)" };
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
        const { color } = iconFor(e);
        const last = i === events.length - 1;
        const note = e.type === "NOTE" || e.type === "COMMENT";
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute bottom-0 left-[4px] top-4 w-px bg-line" />}
            <span aria-hidden className="relative z-10 mt-[0.45rem] size-[9px] shrink-0 rounded-full ring-2 ring-surface" style={{ background: color }} />
            <div className="min-w-0 flex-1">
              {note ? (
                <div className={`rounded-[6px] px-3 py-2 ${e.internal ? "border border-dashed border-tech-gold bg-buzz-50" : "border border-line bg-surface-2"}`}>
                  {e.internal && <p className="eyebrow mb-0.5 !text-gold-ink">Internal note</p>}
                  {e.message && <p className="whitespace-pre-line leading-snug text-ink">{e.message}</p>}
                  {e.photos && e.photos.length > 0 && <CommentPhotos photos={e.photos} />}
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
