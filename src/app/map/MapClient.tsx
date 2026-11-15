"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";
import { Flame, List, MapPin, SlidersHorizontal, Wrench, X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, SEVERITIES, SEVERITY_LABEL, formatTicketNumber, isOpenStatus, type Category, type Severity } from "@/lib/domain";
import { StatusText } from "@/components/TicketTag";
import { relativeTime } from "@/lib/format";
import { PIN_COLOR, isWorking } from "./mapShared";
import { EmptyState } from "@/components/EmptyState";
import { cleanWhere } from "@/components/WorkOrder";

export type MapPoint = {
  id: string;
  number: number;
  lat: number;
  lng: number;
  summary: string;
  status: string;
  severity: string;
  category: string;
  meTooCount: number;
  where: string;
  scope: string;
  following: boolean;
  meToo: boolean;
  isReporter: boolean;
  isOwner: boolean;
  createdAt: string;
  /** Signed-out visitor: show a sign-in link instead of Me too / Follow. */
  guest?: boolean;
  /** When the open work log began (IN_PROGRESS tickets). */
  workingSince?: string;
  /** Short name of the technician; only sent to STAFF and ADMIN. */
  workerName?: string;
  /** Admin map context pins: no Follow / Me too. */
  readOnly?: boolean;
};

const loading = () => (
  <div className="grid h-full place-items-center bg-[#eef0f3] text-sm text-ink-3" role="status">
    Loading map…
  </div>
);
const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false, loading });
const GoogleMap = dynamic(() => import("./GoogleMap"), { ssr: false, loading });

type Show = "open" | "fixed";

function toggle<T>(set: T[], v: T): T[] {
  return set.includes(v) ? set.filter((x) => x !== v) : [...set, v];
}

/** A toggle on the navy control surface: outlined when off, solid white when on. */
const chip =
  "flex cursor-pointer select-none items-center gap-2 rounded-[4px] border-2 border-white/30 px-3 py-1.5 text-[0.9375rem] font-bold text-white transition-[background-color,color,border-color,transform] duration-150 hover:border-white/70 active:scale-[0.97] has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-buzz";
const legend = "mb-2 font-display text-[0.9375rem] font-bold uppercase tracking-[0.08em] text-white/75";

export function MapClient({ points, now, isStudent, googleKey }: { points: MapPoint[]; now: string; isStudent: boolean; googleKey: string | null }) {
  const [show, setShow] = useState<Show[]>(["open"]);
  const [severities, setSeverities] = useState<Severity[]>([...SEVERITIES]);
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [showHeat, setShowHeat] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [view, setView] = useState<"map" | "list">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const onAuthFailure = useCallback(() => setGoogleFailed(true), []);
  const catId = useId();

  const filtered = useMemo(
    () =>
      points.filter(
        (p) => show.includes(isOpenStatus(p.status) ? "open" : "fixed") && severities.includes(p.severity as Severity) && (category === "ALL" || p.category === category),
      ),
    [points, show, severities, category],
  );
  const present = useMemo(() => new Set(points.map((p) => p.category)), [points]);
  const activeFilters = (show.length !== 1 || show[0] !== "open" ? 1 : 0) + (severities.length !== SEVERITIES.length ? 1 : 0) + (category !== "ALL" ? 1 : 0);
  const useGoogle = !!googleKey && !googleFailed;
  const mapProps = { points: filtered, showPins, showHeat, now, isStudent };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-16 md:bottom-0">
      <section className="absolute inset-0" aria-label={view === "map" ? "Map of issues" : "List of issues"}>
        {view === "map" ? (
          <div className="relative isolate h-full">
            {useGoogle ? <GoogleMap apiKey={googleKey!} onAuthFailure={onAuthFailure} {...mapProps} /> : <LeafletMap {...mapProps} />}
            <p className="sr-only">The map is also available as a list. Use the List button to browse the same issues.</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto bg-bg pb-6 pt-48 md:pl-[25rem] md:pr-8 md:pt-6">
            {filtered.length === 0 && (
              <EmptyState art="pin" title="Nothing matches">
                No issues fit these filters. Try turning a few back on.
              </EmptyState>
            )}
            <ul className="stagger mx-4 divide-y divide-line md:mx-0 md:max-w-3xl">
              {filtered
                .slice()
                .sort((a, b) => b.meTooCount - a.meTooCount)
                .map((p) => (
                  <li key={p.id}>
                    <Link href={`/tickets/${p.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 py-4 hover:bg-surface-2 sm:px-2">
                      <span className="min-w-0">
                        <span className="flex items-start gap-2.5">
                          <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-[2px]" style={{ background: isOpenStatus(p.status) ? PIN_COLOR[p.severity as Severity] : PIN_COLOR.FIXED }} />
                          <span className="font-bold leading-snug text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">{p.summary}</span>
                        </span>
                        <span className="mt-0.5 block pl-[1.375rem] text-[0.9375rem] text-ink-3">{cleanWhere(p.where)}</span>
                      </span>
                      <span className="num text-right text-[1.125rem] text-navy">{formatTicketNumber(p.number)}</span>
                      <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[1.375rem] text-[0.9375rem]">
                        <StatusText status={p.status} />
                        {isWorking(p) && (
                          <span className="inline-flex items-center gap-1 rounded-[3px] bg-navy px-1.5 py-0.5 text-[0.8125rem] font-bold text-white">
                            <Wrench aria-hidden className="size-3" /> Working now
                          </span>
                        )}
                        <span className="text-ink-2">{SEVERITY_LABEL[p.severity as Severity]}</span>
                        {p.meTooCount > 0 && <span className="num text-ink-2">{p.meTooCount + 1} affected</span>}
                        <span className="num text-ink-3">{relativeTime(p.createdAt, now)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <aside aria-label="Map filters" className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex md:bottom-5 md:left-5 md:right-auto md:top-5 md:w-[23rem]">
        <div className="pointer-events-auto w-full self-start rounded-[6px] border-t-4 border-buzz bg-navy p-4 text-white shadow-[var(--shadow-lg)] md:max-h-full md:overflow-y-auto md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[1.75rem] font-extrabold uppercase leading-none">Campus map</h1>
              <p className="mt-1.5 text-[0.9375rem] text-white/80" aria-live="polite">
                Showing{" "}
                <strong key={filtered.length} className="anim-tick font-stamp text-[1.625rem] font-extrabold leading-none text-buzz">
                  {filtered.length}
                </strong>{" "}
                of <span className="num">{points.length}</span> issues{isStudent ? " you can see" : ""}.
              </p>
            </div>
            <div className="md:hidden">
              <button
                type="button"
                className="btn btn-sm border-white/40 text-white hover:bg-white/10"
                aria-expanded={filtersOpen}
                aria-controls="map-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                {filtersOpen ? <X aria-hidden className="size-4" /> : <SlidersHorizontal aria-hidden className="size-4" />}
                Filters
                {activeFilters > 0 && <span className="num grid size-5 place-items-center rounded-full bg-buzz text-[0.8125rem] text-navy">{activeFilters}</span>}
              </button>
            </div>
          </div>

          <div role="group" aria-label="View" className="mt-4 grid grid-cols-2 gap-1 rounded-[5px] bg-white/10 p-1">
            {(["map", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-[3px] text-[0.9375rem] font-bold transition-colors duration-150 ${view === v ? "bg-buzz text-navy" : "text-white/80 hover:text-white"}`}
              >
                {v === "map" ? <MapPin aria-hidden className="size-4" /> : <List aria-hidden className="size-4" />}
                {v === "map" ? "Map" : "List"}
              </button>
            ))}
          </div>

          <div id="map-filters" className={`${filtersOpen ? "block" : "hidden"} mt-5 max-h-[50dvh] space-y-5 overflow-y-auto border-t border-white/15 pt-4 md:block md:max-h-none md:overflow-visible`}>
            <fieldset>
              <legend className={legend}>Show</legend>
              <div className="flex flex-wrap gap-1.5">
                <label className={chip}>
                  <input type="checkbox" className="sr-only" checked={show.includes("open")} onChange={() => setShow(toggle(show, "open"))} />
                  Open issues
                </label>
                <label className={chip}>
                  <input type="checkbox" className="sr-only" checked={show.includes("fixed")} onChange={() => setShow(toggle(show, "fixed"))} />
                  Fixed in the last 2 weeks
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend className={legend}>How serious</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {SEVERITIES.map((s) => (
                  <label key={s} className={chip}>
                    <input type="checkbox" className="sr-only" checked={severities.includes(s)} onChange={() => setSeverities(toggle(severities, s))} />
                    <span aria-hidden className="size-3.5 rounded-[2px] ring-2 ring-white" style={{ background: PIN_COLOR[s] }} />
                    {SEVERITY_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={catId} className={`${legend} block`}>
                Category
              </label>
              <select id={catId} className="field" value={category} onChange={(e) => setCategory(e.target.value as Category | "ALL")}>
                <option value="ALL">All categories</option>
                {CATEGORIES.filter((c) => present.has(c)).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className={legend}>Layers</legend>
              <div className="flex flex-wrap gap-1.5">
                <label className={chip}>
                  <input type="checkbox" className="sr-only" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
                  <MapPin aria-hidden className="size-3.5" /> Pins
                </label>
                <label className={chip}>
                  <input type="checkbox" className="sr-only" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} />
                  <Flame aria-hidden className="size-3.5" /> Heat
                </label>
              </div>
            </fieldset>
            {activeFilters > 0 && (
              <button
                type="button"
                className="text-[0.9375rem] font-bold text-buzz underline decoration-2 underline-offset-4"
                onClick={() => {
                  setShow(["open"]);
                  setSeverities([...SEVERITIES]);
                  setCategory("ALL");
                }}
              >
                Reset filters
              </button>
            )}
            <p className="hidden border-t border-white/15 pt-4 text-[0.875rem] leading-relaxed text-white/75 md:block">
              Pin color shows how serious an issue is; green means fixed, and a gold wrench badge means a technician is working on it right now. The number on a pin is how many people reported it. Heat shows where problems cluster.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
