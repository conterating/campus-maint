"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AVAILABILITY_LABEL, formatTicketNumber, type Availability } from "@/lib/domain";
import { summarize, type ContractorLocation } from "@/lib/contractor-locations";
import { relativeTime } from "@/lib/format";
import { cleanWhere } from "@/components/WorkOrder";
import type { MapPoint } from "@/app/map/MapClient";
import { AVAILABILITY_COLOR, initials } from "@/app/map/mapShared";
import { AutoRefresh } from "./AutoRefresh";

const loading = () => (
  <div className="grid h-full place-items-center bg-[#eef0f3] text-sm text-ink-3" role="status">
    Loading map…
  </div>
);
const LeafletMap = dynamic(() => import("@/app/map/LeafletMap"), { ssr: false, loading });
const GoogleMap = dynamic(() => import("@/app/map/GoogleMap"), { ssr: false, loading });

export function AdminMapClient({ contractors, points, now, googleKey, nav }: { contractors: ContractorLocation[]; points: MapPoint[]; now: string; googleKey: string | null; nav?: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const onAuthFailure = useCallback(() => setGoogleFailed(true), []);
  const counts = useMemo(() => summarize(contractors), [contractors]);
  const useGoogle = !!googleKey && !googleFailed;
  const mapProps = { points, showPins: true, showHeat: false, now, isStudent: false, contractors, selectedContractorId: selected, onSelectContractor: setSelected, faintPins: true };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 md:pt-10">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-full">
          <h1 className="h-page">Live map</h1>
          <p className="mt-1 text-ink-2">Where every contractor is working, from their Start work check-ins. Refreshes every 30 seconds.</p>
          {nav}
        </div>
        <Link href="/admin/contractors" className="link-action text-[0.9375rem]">
          Manage contractors
        </Link>
      </div>

      <p className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-4 border-buzz bg-navy px-4 py-3 text-white" aria-live="polite">
        <Count n={counts.working} label="working" />
        <Count n={counts.available} label="available" />
        <Count n={counts.onBreak} label="on break" />
        <Count n={counts.offDuty} label="off duty" />
        <span className="text-[0.875rem] text-white/70">
          · <span className="num">{points.length}</span> open issues shown faint
        </span>
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Map of contractors" className="relative isolate h-[56dvh] min-h-[22rem] overflow-hidden rounded-[6px] ring-1 ring-line lg:h-[calc(100dvh-17rem)] lg:min-h-[30rem]">
          {useGoogle ? <GoogleMap apiKey={googleKey!} onAuthFailure={onAuthFailure} {...mapProps} /> : <LeafletMap {...mapProps} />}
        </section>

        <section aria-labelledby="crew-title" className="min-w-0 lg:max-h-[calc(100dvh-17rem)] lg:overflow-y-auto">
          <h2 id="crew-title" className="rule-head">
            Contractors
          </h2>
          {contractors.length === 0 && <p className="mt-3 text-ink-2">No contractors yet.</p>}
          <ul className="divide-y divide-line">
            {contractors.map((c) => {
              const on = selected === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={c.lat === null}
                    onClick={() => setSelected(c.id)}
                    onMouseEnter={() => c.lat !== null && setSelected(c.id)}
                    className={`flex w-full items-start gap-3 px-2 py-3 text-left transition-colors enabled:hover:bg-surface-2 ${on ? "bg-surface-2" : ""}`}
                  >
                    <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-[0.8125rem] font-extrabold text-white" style={{ background: AVAILABILITY_COLOR[c.availability] ?? "#5b6880" }}>
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-bold text-ink">{c.name}</span>
                        <span className="text-[0.8125rem] font-bold" style={{ color: AVAILABILITY_COLOR[c.availability] }}>
                          {c.state === "working" ? "Working now" : (AVAILABILITY_LABEL[c.availability as Availability] ?? c.availability)}
                        </span>
                      </span>
                      <span className="block text-[0.875rem] text-ink-3">{c.company}</span>
                      {c.ticket ? (
                        <span className="mt-1 block text-[0.875rem] leading-snug text-ink-2">
                          <span className="num text-navy">{formatTicketNumber(c.ticket.number)}</span> {c.ticket.summary}
                          <span className="block text-ink-3">{cleanWhere(c.ticket.where)}</span>
                          <span className="num block text-ink-3">{c.state === "working" ? `On the job ${relativeTime(c.at!, now).replace(" ago", "")}` : `Last seen ${relativeTime(c.at!, now)}`}</span>
                        </span>
                      ) : (
                        <span className="mt-1 block text-[0.875rem] text-ink-3">No check-ins yet</span>
                      )}
                    </span>
                  </button>
                  {c.ticket && (
                    <Link href={`/tickets/${c.ticket.id}`} className="link-action mb-2 ml-14 inline-block text-[0.875rem]">
                      Open {formatTicketNumber(c.ticket.number)}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <strong className="font-stamp text-[1.625rem] font-extrabold leading-none text-buzz">{n}</strong> <span className="text-[0.9375rem] font-bold">{label}</span>
    </span>
  );
}
