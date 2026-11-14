import { AlertOctagon, ArrowRightLeft, Check, CircleDot, Lock, MessageCircle, MessageSquare, PencilLine, RotateCcw, TrendingUp, Users } from "lucide-react";
import { STATUS_LABEL, TIMELINE_STEPS, type Status } from "@/lib/domain";
import { formatDateTime, relativeTime } from "@/lib/format";
import { STATUS_COLOR } from "./badges";

/** The six-step progress strip: Submitted → … → Confirmed (or Reopened). */
export function StatusSteps({ status }: { status: string }) {
  const reopened = status === "REOPENED";
  const currentIndex = reopened ? TIMELINE_STEPS.indexOf("IN_PROGRESS") : TIMELINE_STEPS.indexOf(status as Status);
  return (
    <ol className="grid grid-cols-6 gap-1.5" aria-label="Progress">
      {TIMELINE_STEPS.map((step, i) => {
        const current = !reopened && step === status;
        const done = i < currentIndex || current;
        return (
          <li key={step} className="flex min-w-0 flex-col gap-2" aria-current={current ? "step" : undefined}>
            <span aria-hidden className="h-1 rounded-full" style={{ background: done ? STATUS_COLOR[status as Status] ?? "var(--navy)" : "var(--line)" }} />
            <span className={`truncate text-[0.6875rem] sm:text-xs ${current ? "font-bold text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>
              {STATUS_LABEL[step]}
              <span className="sr-only">{current ? " (current)" : done ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
        const { Icon, color } = iconFor(e);
        const last = i === events.length - 1;
        const note = e.type === "NOTE" || e.type === "COMMENT";
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
                  {e.message && <p className="whitespace-pre-line leading-snug text-ink">{e.message}</p>}
                  {e.photos && e.photos.length > 0 && <CommentPhotos photos={e.photos} />}
                </div>
              ) : (
                <p className="leading-snug text-ink-2">
                  {e.type === "STATUS" && e.toStatus && <span className="font-bold text-ink">{STATUS_LABEL[e.toStatus as Status]}: </span>}
                  <span className={e.type === "ESCALATED" ? "font-bold text-emergency" : ""}>{e.message}</span>
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
