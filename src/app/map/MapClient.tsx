"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronRight, Flame, List, MapPin, SlidersHorizontal, Users, X } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  formatTicketNumber,
  type Category,
  type Severity,
  type Status,
} from "@/lib/domain";
import { CategoryIcon, SeverityText, STATUS_HEX, StatusPill } from "@/components/badges";
import { relativeTime } from "@/lib/format";

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

function MapLoading() {
  return (
    <div className="grid h-full place-items-center bg-[#e3e8ee] text-sm text-ink-3" role="status">
      Loading map…
    </div>
  );
}

// Only the renderer in use is downloaded: Google Maps when a key is configured,
// OpenStreetMap (Leaflet) otherwise.
const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false, loading: MapLoading });
const GoogleMap = dynamic(() => import("./GoogleMap"), { ssr: false, loading: MapLoading });

export type GoogleMapsConfig = { apiKey: string; mapId: string } | null;

// Which Google Maps key was rejected in this tab. Stored per key, so fixing the
// key in .env makes the next load try Google again.
const REJECTED_KEY = "hm-gmaps-rejected-key";
const noSubscribe = () => () => {};
function keyWasRejected(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  try {
    return sessionStorage.getItem(REJECTED_KEY) === apiKey;
  } catch {
    return false;
  }
}

const OPEN_DEFAULT: Status[] = ["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];

function toggle<T>(set: T[], v: T): T[] {
  return set.includes(v) ? set.filter((x) => x !== v) : [...set, v];
}

const chip =
  "flex cursor-pointer items-center gap-2 rounded-full bg-surface px-2.5 py-1 text-[0.8125rem] font-bold text-ink-2 ring-1 ring-inset ring-line-2 has-[:checked]:bg-navy has-[:checked]:text-white has-[:checked]:ring-navy has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-buzz";

export function MapClient({ points, now, isStudent, googleMaps }: { points: MapPoint[]; now: string; isStudent: boolean; googleMaps: GoogleMapsConfig }) {
  const [statuses, setStatuses] = useState<Status[]>(OPEN_DEFAULT);
  const [severities, setSeverities] = useState<Severity[]>([...SEVERITIES]);
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [showHeat, setShowHeat] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [view, setView] = useState<"map" | "list">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const catId = useId();

  // Google calls window.gm_authFailure when it rejects the key (invalid,
  // restricted to other sites, or billing off), then blanks the map with an
  // error box. Unmounting that half-torn-down map from React crashes the page
  // (measured: 4 of 4 fresh loads with an invalid key), so instead remember the
  // rejection for this tab and reload; the reload renders OpenStreetMap from
  // the start and never loads Google's script. If sessionStorage is
  // unavailable, don't reload (that would loop): Google's error box stays.
  const googleFailed = useSyncExternalStore(noSubscribe, () => keyWasRejected(googleMaps?.apiKey), () => false);
  useEffect(() => {
    if (!googleMaps || googleFailed) return;
    const w = window as Window & { gm_authFailure?: () => void };
    w.gm_authFailure = () => {
      try {
        sessionStorage.setItem(REJECTED_KEY, googleMaps.apiKey);
        window.location.reload();
      } catch {
        // No storage: leave Google's own error message in place.
      }
    };
    return () => {
      delete w.gm_authFailure;
    };
  }, [googleMaps, googleFailed]);
  const useGoogle = googleMaps !== null && !googleFailed;

  const filtered = useMemo(
    () => points.filter((p) => statuses.includes(p.status as Status) && severities.includes(p.severity as Severity) && (category === "ALL" || p.category === category)),
    [points, statuses, severities, category],
  );
  const present = useMemo(() => new Set(points.map((p) => p.category)), [points]);
  const statusChanged = statuses.length !== OPEN_DEFAULT.length || statuses.some((s) => !OPEN_DEFAULT.includes(s));
  const activeFilters = (statusChanged ? 1 : 0) + (severities.length !== SEVERITIES.length ? 1 : 0) + (category !== "ALL" ? 1 : 0);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-16 md:bottom-0">
      {/* Map or list fills the space */}
      <section className="absolute inset-0" aria-label={view === "map" ? "Map of issues" : "List of issues"}>
        {view === "map" ? (
          <div className="relative isolate h-full">
            {useGoogle ? (
              <GoogleMap apiKey={googleMaps.apiKey} mapId={googleMaps.mapId} points={filtered} showPins={showPins} showHeat={showHeat} now={now} isStudent={isStudent} />
            ) : (
              <LeafletMap points={filtered} showPins={showPins} showHeat={showHeat} now={now} isStudent={isStudent} />
            )}
            <p className="sr-only">The map is also available as a list. Use the List button to browse the same issues.</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto bg-bg pb-6 pt-40 md:pl-[23.5rem] md:pr-6 md:pt-4">
            <ul className="list-group mx-3 md:mx-0 md:max-w-3xl">
              {filtered.length === 0 && <li className="px-6 py-10 text-center text-ink-3">No issues match these filters.</li>}
              {filtered
                .slice()
                .sort((a, b) => b.meTooCount - a.meTooCount)
                .map((p) => (
                  <li key={p.id}>
                    <Link href={`/tickets/${p.id}`} className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2">
                      <CategoryIcon category={p.category} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold leading-snug text-ink group-hover:text-navy">{p.summary}</span>
                        <span className="mt-0.5 block truncate text-sm text-ink-3">{p.where}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-3">
                          <SeverityText severity={p.severity} />
                          <span className="num">{formatTicketNumber(p.number)}</span>
                          <span>{relativeTime(p.createdAt, now)}</span>
                          {p.meTooCount > 0 && (
                            <span className="inline-flex items-center gap-1 font-bold text-ink-2">
                              <Users aria-hidden className="size-3.5" />
                              {p.meTooCount} me too
                            </span>
                          )}
                        </span>
                      </span>
                      <StatusPill status={p.status} size="sm" />
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-line-2" />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      {/* Floating control panel */}
      <aside aria-label="Map filters" className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex md:bottom-4 md:left-4 md:right-auto md:top-4 md:w-[21.5rem]">
        <div className="pointer-events-auto w-full self-start rounded-[16px] bg-surface/95 p-4 shadow-[var(--shadow-lg)] ring-1 ring-line backdrop-blur-md md:max-h-full md:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[1.25rem] font-bold tracking-[-0.02em] text-ink">Campus map</h1>
              <p className="text-sm text-ink-3" aria-live="polite">
                Showing <strong className="num text-ink">{filtered.length}</strong> of {points.length} issues{isStudent ? " you can see" : ""}.
              </p>
              {googleFailed && (
                <p role="status" className="mt-1 text-xs text-ink-3">
                  Google Maps didn’t accept its API key, so this is the OpenStreetMap view.
                </p>
              )}
            </div>
            <div className="md:hidden">
              <button type="button" className="btn btn-secondary btn-sm" aria-expanded={filtersOpen} aria-controls="map-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
                {filtersOpen ? <X aria-hidden className="size-4" /> : <SlidersHorizontal aria-hidden className="size-4" />}
                Filters
                {activeFilters > 0 && <span className="num grid size-5 place-items-center rounded-full bg-navy text-[0.6875rem] text-white">{activeFilters}</span>}
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
              <legend className="label">Status</legend>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <label key={s} className={chip}>
                    <input type="checkbox" className="sr-only" checked={statuses.includes(s)} onChange={() => setStatuses(toggle(statuses, s))} />
                    <span aria-hidden className="size-2 rounded-full ring-[1.5px] ring-white" style={{ background: STATUS_HEX[s] }} />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Severity</legend>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITIES.map((s) => (
                  <label key={s} className={chip}>
                    <input type="checkbox" className="sr-only" checked={severities.includes(s)} onChange={() => setSeverities(toggle(severities, s))} />
                    {SEVERITY_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
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
                  setStatuses(OPEN_DEFAULT);
                  setSeverities([...SEVERITIES]);
                  setCategory("ALL");
                }}
              >
                Reset filters
              </button>
            )}
            <div className="hidden border-t border-line pt-4 md:block">
              <p className="eyebrow mb-2">Pin color = status</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2">
                {STATUSES.map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: STATUS_HEX[s] }} />
                    {STATUS_LABEL[s]}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Dashed red ring: emergency. Number: “me too” reports.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
