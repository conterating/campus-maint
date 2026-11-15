"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Database, FastForward, RotateCcw } from "lucide-react";
import { fastForward, resetDemoClock, resetDemoData, switchViewer } from "@/app/actions";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";
import { Avatar } from "@/components/Avatar";
import { formatDuration } from "@/lib/sla";

const STEPS = [
  { hours: 0.5, label: "+30 min" },
  { hours: 1, label: "+1 hour" },
  { hours: 4, label: "+4 hours" },
  { hours: 24, label: "+1 day" },
  { hours: 48, label: "+2 days" },
];

export function DemoControls({ offsetMs, nowLabel }: { offsetMs: number; nowLabel: string }) {
  const { pending, message, run } = useAction();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <section aria-labelledby="clock-title" className="card mt-6 overflow-hidden">
      <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[1fr_auto] md:items-start md:p-6">
        <div>
          <h2 id="clock-title" className="flex items-center gap-2 h-section text-lg">
            <Clock aria-hidden className="size-5 text-ink-3" /> Demo clock
          </h2>
          <p className="mt-1 text-ink-2">
            It&apos;s <span className="font-bold text-ink">{nowLabel}</span> on campus
            {offsetMs > 0 ? (
              <>
                {" "}
                (<span className="num">{formatDuration(offsetMs)}</span> ahead of real time)
              </>
            ) : (
              " (real time)"
            )}
            . Jump ahead to watch tickets pass their response target and escalate to a supervisor.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm justify-self-start" disabled={pending || offsetMs === 0} onClick={() => run(() => resetDemoClock(), "Clock back to real time.")}>
          <RotateCcw aria-hidden className="size-4" /> Back to real time
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-5 pb-5 md:px-6" role="group" aria-label="Fast-forward the demo clock">
        {STEPS.map((s) => (
          <button
            key={s.hours}
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending}
            onClick={() =>
              run(
                () => fastForward(s.hours),
                (d) => `Clock moved ${s.label.slice(1)} ahead. ${d.escalated ? `${d.escalated} overdue ticket${d.escalated === 1 ? "" : "s"} escalated.` : "Nothing new escalated."}`,
              )
            }
          >
            <FastForward aria-hidden className="size-4 text-ink-3" /> {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-5 py-3.5 md:px-6">
        {confirmReset ? (
          <>
            <p className="text-sm font-bold text-ink">Replace all tickets with fresh sample data?</p>
            <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => resetDemoData(), "Demo data reset.", () => setConfirmReset(false))}>
              Yes, reset everything
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>
            <Database aria-hidden className="size-4" /> Reset demo data
          </button>
        )}
      </div>
      <div className="px-5 pb-1 md:px-6 [&_p]:mb-4">
        <ActionMessage message={message} />
      </div>
    </section>
  );
}

export function UserButton({ id, name, hue, detail, current }: { id: string; name: string; hue: number; detail: string; current: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      aria-pressed={current}
      disabled={pending}
      onClick={() => run(() => switchViewer(id), undefined, (d) => router.push(d.home))}
      className={`flex w-full items-center gap-3 rounded-[8px] bg-surface p-3 text-left shadow-[var(--shadow-xs)] ring-inset transition-colors ${
        current ? "ring-2 ring-navy" : "ring-1 ring-line hover:bg-surface-2 hover:ring-line-2"
      }`}
    >
      <Avatar name={name} hue={hue} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{name}</span>
        <span className="block truncate text-sm text-ink-3">{detail}</span>
      </span>
      {current && (
        <span className="pill bg-navy text-white !text-xs">
          <Check aria-hidden className="size-3" /> Viewing
        </span>
      )}
      <span className="sr-only">{current ? "(current)" : `View as ${name}`}</span>
    </button>
  );
}
