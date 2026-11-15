"use client";

import { useId, useState } from "react";
import { Coffee, Loader2, Trash2 } from "lucide-react";
import { addBreakAction, backToWorkAction, deleteBreakAction, takeBreakNowAction } from "@/app/schedule-actions";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";

export type BreakRow = { id: string; label: string; reason: string | null; future: boolean };
export type DayOption = { offset: number; label: string };

const PRESETS = [15, 30, 60];

export function BreakManager({ breaks, dayOptions, onBreak, canTakeBreak }: { breaks: BreakRow[]; dayOptions: DayOption[]; onBreak: boolean; canTakeBreak: boolean }) {
  const uid = useId();
  const add = useAction();
  const quick = useAction();
  const del = useAction();
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState("12:00");
  const [length, setLength] = useState("30");
  const [end, setEnd] = useState("12:30");
  const [reason, setReason] = useState("");
  const [nowMinutes, setNowMinutes] = useState("15");
  const custom = length === "custom";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        {onBreak ? (
          <button type="button" className="btn btn-accent" disabled={quick.pending} onClick={() => quick.run(() => backToWorkAction(), "Welcome back. You're available again.")}>
            {quick.pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Back to work
          </button>
        ) : (
          <>
            <div>
              <label htmlFor={`${uid}-now`} className="label">
                Take a break now
              </label>
              <select id={`${uid}-now`} className="field" value={nowMinutes} onChange={(e) => setNowMinutes(e.target.value)} disabled={!canTakeBreak || quick.pending}>
                {PRESETS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-secondary" disabled={!canTakeBreak || quick.pending} onClick={() => quick.run(() => takeBreakNowAction(Number(nowMinutes)), `On a ${nowMinutes}-minute break.`)}>
              {quick.pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Coffee aria-hidden className="size-4" />} Start break
            </button>
          </>
        )}
      </div>
      <ActionMessage message={quick.message} />

      <form
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          add.run(
            () => addBreakAction({ dayOffset: offset, startTime: start, ...(custom ? { endTime: end } : { minutes: Number(length) }), reason: reason.trim() || null }),
            (d) => (d.moved ? `Break added. ${d.moved} later job${d.moved === 1 ? " was" : "s were"} pushed back.` : "Break added."),
          );
        }}
      >
        <div>
          <label htmlFor={`${uid}-day`} className="label">
            Day
          </label>
          <select id={`${uid}-day`} className="field" value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
            {dayOptions.map((d) => (
              <option key={d.offset} value={d.offset}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-start`} className="label">
            Starts
          </label>
          <input id={`${uid}-start`} type="time" required className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-len`} className="label">
            Length
          </label>
          <select id={`${uid}-len`} className="field" value={length} onChange={(e) => setLength(e.target.value)}>
            {PRESETS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
            <option value="custom">Custom end time</option>
          </select>
        </div>
        {custom && (
          <div>
            <label htmlFor={`${uid}-end`} className="label">
              Ends
            </label>
            <input id={`${uid}-end`} type="time" required className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <div className={custom ? "" : "lg:col-span-1"}>
          <label htmlFor={`${uid}-reason`} className="label">
            Reason <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input id={`${uid}-reason`} className="field" maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lunch" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={add.pending}>
            {add.pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Add break
          </button>
        </div>
      </form>
      <ActionMessage message={add.message} />

      {breaks.length > 0 && (
        <ul className="list-group mt-5">
          {breaks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
              <p className="min-w-0 text-[0.9375rem]">
                <span className="num text-navy">{b.label}</span> {b.reason && <span className="text-ink-2">· {b.reason}</span>}
              </p>
              {b.future && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={del.pending} onClick={() => del.run(() => deleteBreakAction(b.id), "Break deleted.")} aria-label={`Delete break ${b.label}`}>
                  <Trash2 aria-hidden className="size-4" /> Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ActionMessage message={del.message} />
    </div>
  );
}
