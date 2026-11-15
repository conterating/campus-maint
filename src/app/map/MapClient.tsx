"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";
import { ChevronRight, Flame, List, MapPin, SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, SEVERITIES, SEVERITY_LABEL, formatTicketNumber, isOpenStatus, type Category, type Severity } from "@/lib/domain";
import { StatusText } from "@/components/TicketTag";
import { relativeTime } from "@/lib/format";
import { PIN_COLOR } from "./mapShared";

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

const chip =
  "flex cursor-pointer items-center gap-2 rounded-[4px] bg-surface px-3 py-1.5 text-[0.8125rem] font-bold text-ink-2 ring-1 ring-inset ring-line-2 transition-colors hover:bg-surface-2 has-[:checked]:bg-navy has-[:checked]:text-white has-[:checked]:ring-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy";

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
          <div className="h-full overflow-y-auto bg-bg pb-6 pt-44 md:pl-[24rem] md:pr-6 md:pt-4">
            <ul className="list-group mx-3 md:mx-0 md:max-w-3xl">
              {filtered.length === 0 && <li className="px-6 py-10 text-center text-ink-3">No issues match these filters.</li>}
              {filtered
                .slice()
                .sort((a, b) => b.meTooCount - a.meTooCount)
                .map((p) => (
                  <li key={p.id}>
                    <Link href={`/tickets/${p.id}`} className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2">
                      <span aria-hidden className="mt-1 size-2.5 shrink-0 self-start rounded-full" style={{ background: isOpenStatus(p.status) ? PIN_COLOR[p.severity as Severity] : PIN_COLOR.FIXED }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold leading-snug text-ink group-hover:text-navy">{p.summary}</span>
                        <span className="mt-0.5 block truncate text-sm text-ink-3">{p.where}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-3">
                          <StatusText status={p.status} />
                          <span aria-hidden>·</span>
                          <span>{SEVERITY_LABEL[p.severity as Severity]}</span>
                          <span aria-hidden>·</span>
                          <span>{relativeTime(p.createdAt, now)}</span>
                          {p.meTooCount > 0 && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-bold text-ink-2">{p.meTooCount + 1} affected</span>
                            </>
                          )}
                          <span aria-hidden>·</span>
                          <span className="num">{formatTicketNumber(p.number)}</span>
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-line-2" />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <aside aria-label="Map filters" className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex md:bottom-4 md:left-4 md:right-auto md:top-4 md:w-[22rem]">
        <div className="pointer-events-auto w-full self-start rounded-[8px] bg-surface/95 p-4 shadow-[var(--shadow-lg)] ring-1 ring-line backdrop-blur-md md:max-h-full md:overflow-y-auto md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[2rem] font-extrabold leading-none text-navy">Campus map</h1>
              <p className="text-sm text-ink-3" aria-live="polite">
                Showing <strong className="text-ink">{filtered.length}</strong> of {points.length} issues{isStudent ? " you can see" : ""}.
              </p>
            </div>
            <div className="md:hidden">
              <button type="button" className="btn btn-secondary btn-sm" aria-expanded={filtersOpen} aria-controls="map-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
                {filtersOpen ? <X aria-hidden className="size-4" /> : <SlidersHorizontal aria-hidden className="size-4" />}
                Filters
                {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-navy text-[0.6875rem] text-white">{activeFilters}</span>}
              </button>
            </div>
          </div>

          <div role="group" aria-label="View" className="seg mt-3 w-full">
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
              <MapPin aria-hidden className="size-4" /> Map
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              <List aria-hidden className="size-4" /> List
            </button>
          </div>

          <div id="map-filters" className={`${filtersOpen ? "block" : "hidden"} mt-4 max-h-[50dvh] space-y-5 overflow-y-auto border-t border-line pt-4 md:block md:max-h-none md:overflow-visible`}>
            <fieldset>
              <legend className="label">Show</legend>
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
              <legend className="label">How serious</legend>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITIES.map((s) => (
                  <label key={s} className={chip}>
                    <input type="checkbox" className="sr-only" checked={severities.includes(s)} onChange={() => setSeverities(toggle(severities, s))} />
                    <span aria-hidden className="size-2.5 rounded-full ring-[1.5px] ring-white" style={{ background: PIN_COLOR[s] }} />
                    {SEVERITY_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={catId} className="label">
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
              <legend className="label">Layers</legend>
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
                className="text-sm font-bold text-navy hover:underline"
                onClick={() => {
                  setShow(["open"]);
                  setSeverities([...SEVERITIES]);
                  setCategory("ALL");
                }}
              >
                Reset filters
              </button>
            )}
            <p className="hidden border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-ink-3 md:block">
              Pin color shows how serious an issue is; green means fixed. The number on a pin is how many people reported it. Heat shows where problems cluster.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
