import { STATUS_LABEL, type Status } from "@/lib/domain";
import { formatDateTime, relativeTime } from "@/lib/format";
import { STATUS_COLOR } from "./badges";
import { IdText } from "./WorkOrder";

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
          <a href={src} target="_blank" rel="noopener" className="block overflow-hidden rounded-[4px] ring-1 ring-line hover:ring-2 hover:ring-navy">
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

/** What to call each entry, in the shared status colors (red/orange only for urgency). */
function labelFor(e: Event): { label: string; color: string } {
  if (e.type === "STATUS" && e.toStatus) {
    const st = e.toStatus as Status;
    return { label: st === "SUBMITTED" ? "Reported" : (STATUS_LABEL[st] ?? "Update"), color: STATUS_COLOR[st] ?? "var(--ink-3)" };
  }
  switch (e.type) {
    case "NOTE":
      return e.internal ? { label: "Internal note", color: "var(--gold-ink)" } : { label: "Update", color: "var(--navy)" };
    case "COMMENT":
      return { label: "Comment", color: "var(--ink-2)" };
    case "ESCALATED":
      return { label: "Escalated", color: "var(--sev-emergency)" };
    case "REASSIGN":
      return { label: "Moved", color: "var(--navy)" };
    case "OVERRIDE":
      return { label: "Changed", color: "var(--navy)" };
    case "METOO":
      return { label: "Me too", color: "var(--ink-2)" };
    case "PRIORITY":
      return { label: "Priority raised", color: "var(--sev-urgent)" };
    default:
      return { label: "Update", color: "var(--ink-3)" };
  }
}

/** Say each thing once: drop text that only repeats the label or the author line. */
function cleanMessage(e: Event, label: string): string {
  let m = e.message.trim();
  if (e.type === "STATUS" && e.toStatus) {
    const st = STATUS_LABEL[e.toStatus as Status];
    if (st) m = m.replace(new RegExp(`^${st} — `), "");
    if (e.toStatus === "SUBMITTED" && /^Report submitted by\b/.test(m)) return "";
    if (st && m.toLowerCase() === st.toLowerCase()) return "";
  }
  if (m.toLowerCase() === label.toLowerCase()) return "";
  if (e.type === "METOO") {
    const n = m.match(/\((\d+) people affected\)/);
    if (n) return `${n[1]} people affected now`;
  }
  return m.replace(/^(AI triage|Auto-triage):\s*/, "Sorted automatically: ");
}

/**
 * The work-order log: time on the left in the stamp face, then what happened.
 * Notes and comments hang off a colored rule instead of sitting in bubbles.
 */
export function Timeline({ events, now }: { events: Event[]; now: Date }) {
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => {
        const { label, color } = labelFor(e);
        const note = e.type === "NOTE" || e.type === "COMMENT";
        const text = cleanMessage(e, label);
        return (
          <li key={e.id} className="grid grid-cols-1 gap-x-6 gap-y-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <p className="num text-[0.9375rem] font-semibold text-ink-3 sm:pt-0.5">
              <time dateTime={e.createdAt.toISOString()} title={relativeTime(e.createdAt, now)}>
                {formatDateTime(e.createdAt)}
              </time>
            </p>
            <div className="min-w-0">
              <p className="font-display text-[1.125rem] font-bold uppercase leading-tight tracking-[0.02em]" style={{ color }}>
                {label}
                {e.internal && <span className="ml-2 font-sans text-xs font-bold normal-case tracking-normal text-gold-ink">hidden from students</span>}
              </p>
              {note ? (
                (text || (e.photos && e.photos.length > 0)) && (
                  <div className={`mt-1.5 border-l-[3px] pl-3.5 ${e.internal ? "border-tech-gold" : e.type === "COMMENT" ? "border-line-2" : "border-navy"}`}>
                    {text && (
                      <p className="whitespace-pre-line leading-snug text-ink">
                        <IdText text={text} />
                      </p>
                    )}
                    {e.photos && e.photos.length > 0 && <CommentPhotos photos={e.photos} />}
                  </div>
                )
              ) : (
                text && (
                  <p className={`mt-0.5 leading-snug ${e.type === "ESCALATED" ? "font-bold text-emergency" : "text-ink-2"}`}>
                    <IdText text={text} />
                  </p>
                )
              )}
              {e.actorLabel && <p className="mt-1 text-[0.9375rem] text-ink-3">{e.actorLabel}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
