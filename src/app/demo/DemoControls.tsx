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
    <section aria-labelledby="clock-title" className="mt-10">
      <div className="rule-head">
        <h2 id="clock-title" className="flex items-center gap-2 h-section">
          <Clock aria-hidden className="size-5" /> Demo clock
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending || offsetMs === 0} onClick={() => run(() => resetDemoClock(), "Clock back to real time.")}>
          <RotateCcw aria-hidden className="size-4" /> Back to real time
        </button>
      </div>
      <div className="mt-5">
        <div>
          <p aria-hidden className="font-display text-[3rem] font-extrabold uppercase leading-[0.9] text-navy md:text-[4rem]">
            {nowLabel}
          </p>
          <p className="mt-2 text-ink-2">
            It&apos;s <span className="num text-[1.125rem] text-ink">{nowLabel}</span> on campus
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
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Fast-forward the demo clock">
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
            <FastForward aria-hidden className="size-4" /> <span className="num text-[1.0625rem]">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
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
      <div className="[&_p]:mt-4">
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
      className={`relative flex w-full items-center gap-3 border-b border-line py-3 pl-3 pr-2 text-left transition-colors before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full ${
        current ? "bg-navy-50/60 before:bg-navy" : "hover:bg-surface-2 before:bg-transparent"
      }`}
    >
      <Avatar name={name} hue={hue} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{name}</span>
        <span className="block truncate text-sm text-ink-3">{detail}</span>
      </span>
      {current && (
        <span className="flex items-center gap-1 font-display text-[0.9375rem] font-bold uppercase text-navy">
          <Check aria-hidden className="size-3.5" /> Viewing
        </span>
      )}
      <span className="sr-only">{current ? "(current)" : `View as ${name}`}</span>
    </button>
  );
}
