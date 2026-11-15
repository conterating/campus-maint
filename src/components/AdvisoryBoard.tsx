import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, MapPin, Siren } from "lucide-react";
import { ADVISORY_SEVERITY_LABEL, type AdvisoryRow, type AdvisorySeverity } from "@/lib/advisories";
import { formatDateTime, relativeTime } from "@/lib/format";

const STYLE = {
  EMERGENCY: { Icon: Siren, box: "border-emergency bg-emergency-bg", text: "text-emergency", chip: "bg-emergency text-white" },
  WARNING: { Icon: AlertTriangle, box: "border-urgent bg-urgent-bg", text: "text-urgent", chip: "bg-urgent text-white" },
  INFO: { Icon: Info, box: "border-navy bg-navy-50", text: "text-navy", chip: "bg-navy text-white" },
} as const;

/** "Until Nov 16, 6:00 PM" or "Until further notice". */
export function advisoryUntil(a: Pick<AdvisoryRow, "endsAt">) {
  return a.endsAt ? `Until ${formatDateTime(a.endsAt)}` : "Until further notice";
}

export function advisoryPlace(a: Pick<AdvisoryRow, "area" | "building">) {
  return a.area ?? a.building?.name ?? null;
}

export function AdvisoryCard({ advisory: a, now, headingLevel = 3, ended }: { advisory: AdvisoryRow; now: Date; headingLevel?: 2 | 3; ended?: boolean }) {
  const sev = (a.severity in STYLE ? a.severity : "INFO") as AdvisorySeverity;
  const s = STYLE[sev];
  const H = `h${headingLevel}` as "h2" | "h3";
  const place = advisoryPlace(a);
  const showBuilding = a.building && a.area && !a.area.toLowerCase().includes(a.building.name.toLowerCase());
  return (
    <article className={`overflow-hidden rounded-[6px] border-2 ${ended ? "border-line bg-surface-2" : s.box}`}>
      {sev === "EMERGENCY" && !ended && <div aria-hidden className="hazard h-1.5" />}
      <div className="flex gap-3.5 p-4 md:p-5">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${ended ? "bg-line-2 text-ink-2" : s.chip}`}>
          <s.Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`wo-label ${ended ? "" : s.text}`}>{ended ? "Ended · " : ""}{ADVISORY_SEVERITY_LABEL[sev]}</p>
          <H className={`font-display mt-0.5 text-[1.1875rem] font-bold leading-snug ${ended ? "text-ink-2" : "text-ink"}`}>{a.title}</H>
          {place && (
            <p className="mt-1 flex items-start gap-1.5 text-[0.9375rem] font-semibold text-ink">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {place}
                {showBuilding ? <span className="font-normal text-ink-2"> · {a.building!.name}</span> : null}
              </span>
            </p>
          )}
          <p className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2">{a.message}</p>
          <p className="mt-2 text-[0.8125rem] text-ink-3">
            {ended && a.clearedAt ? `Cleared ${relativeTime(a.clearedAt, now)}` : `Posted ${relativeTime(a.startsAt, now)} · ${advisoryUntil(a)}`}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Active "avoid this area" notices. Renders nothing when there are none. */
export function AdvisoryBoard({ advisories, now, className = "" }: { advisories: AdvisoryRow[]; now: Date; className?: string }) {
  if (!advisories.length) return null;
  const hasEmergency = advisories.some((a) => a.severity === "EMERGENCY");
  return (
    <section role="region" aria-label="Campus advisories" className={`space-y-3 ${className}`}>
      <h2 className="sr-only">Campus advisories</h2>
      {advisories.map((a) => (
        <AdvisoryCard key={a.id} advisory={a} now={now} />
      ))}
      <Link href="/advisories" className="link-action inline-flex items-center gap-1.5 text-[0.9375rem]">
        {hasEmergency ? "All advisories and what to do" : "All advisories"} <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
