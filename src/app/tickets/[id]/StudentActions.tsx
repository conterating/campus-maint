"use client";

import { useId, useState } from "react";
import { Bell, CheckCircle2, RotateCcw } from "lucide-react";
import { confirmAction, followAction, meTooAction, reopenAction } from "@/app/actions";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";

export function StudentActions(props: {
  ticketId: string;
  status: string;
  isReporter: boolean;
  isOwner: boolean;
  following: boolean;
  meToo: boolean;
  canMeToo: boolean;
  /** People affected (reporter + "me too"s), as the server last saw it. */
  affected: number;
  watchers: number;
}) {
  const { pending, message, run, setMessage } = useAction();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  // Optimistic "me too": count it the moment it's tapped; undo if the server says no.
  const [pressed, setPressed] = useState(false);
  const reasonId = useId();
  const canCloseOut = props.isReporter || props.isOwner;
  const counted = props.meToo || pressed;
  const affected = props.affected + (pressed && !props.meToo ? 1 : 0);
  const showMeToo = props.canMeToo || props.meToo;

  function meToo() {
    setPressed(true);
    setMessage(null);
    run(
      async () => {
        const res = await meTooAction(props.ticketId);
        if (!res.ok) setPressed(false);
        return res;
      },
      (d) => (d.raisedTo ? `Counted. That pushed its priority up to ${d.raisedTo.toLowerCase()}.` : "Counted. You're following it now."),
    );
  }

  return (
    <div className="space-y-6">
      {props.status === "RESOLVED" && canCloseOut && !reopening && (
        <div className="border-l-4 border-st-fixed pl-4">
          <p className="font-display text-[1.5rem] font-bold uppercase leading-none text-st-fixed">Fixed? Confirm it.</p>
          <p className="mt-1.5 text-[0.9375rem] text-ink-2">Confirming closes the ticket. Still broken? Reopen it and say what&apos;s wrong.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-success" disabled={pending} onClick={() => run(() => confirmAction(props.ticketId), "Thanks! Marked as confirmed.")}>
              <CheckCircle2 aria-hidden className="size-4" /> Yes, it&apos;s fixed
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setReopening(true)} aria-expanded={reopening}>
              <RotateCcw aria-hidden className="size-4" /> No, still broken
            </button>
          </div>
        </div>
      )}

      {props.status === "CONFIRMED" && canCloseOut && !reopening && (
        <button type="button" className="btn btn-secondary w-full" onClick={() => setReopening(true)} aria-expanded={reopening}>
          <RotateCcw aria-hidden className="size-4" /> It broke again: reopen
        </button>
      )}

      {reopening && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => reopenAction(props.ticketId, reason), "Reopened. Staff have been told.", () => {
              setReopening(false);
              setReason("");
            });
          }}
        >
          <label htmlFor={reasonId} className="label">
            What&apos;s still wrong?
          </label>
          <textarea id={reasonId} className="field min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} autoFocus />
          <div className="mt-2 flex gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
              Reopen ticket
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setReopening(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {showMeToo && (
        <div>
          <p className="flex items-end gap-3 leading-none">
            <span className="overflow-hidden">
              <span key={affected} className="anim-tick font-display text-[3.5rem] font-extrabold leading-[0.8] text-navy">
                {affected}
              </span>
            </span>{" "}
            <span className="pb-1 font-display text-[1.375rem] font-bold uppercase leading-none text-ink">{affected === 1 ? "person affected" : "people affected"}</span>
          </p>
          <p className="mt-1.5 text-[0.9375rem] text-ink-2">{counted ? "Including you." : "Same problem? Add yourself instead of filing a new report."}</p>
          {counted ? (
            <p className="mt-3 flex items-center gap-2 border-l-4 border-navy pl-3 font-bold text-navy">You said “me too” on this.</p>
          ) : (
            <>
              <button key={String(pressed)} type="button" className={`btn btn-accent mt-3 w-full text-[1.0625rem] ${pressed ? "anim-press" : ""}`} disabled={pending} onClick={meToo}>
                Me too
              </button>
              <p className="hint mt-1.5">Raises its priority and follows it for you.</p>
            </>
          )}
        </div>
      )}

      <div className="border-t border-line pt-4">
        {props.isOwner ? (
          <p className="flex items-center gap-2 text-[0.9375rem] text-ink-2">
            <Bell aria-hidden className="size-4 text-navy" /> It&apos;s your room, so you get every update.
          </p>
        ) : props.following ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-bold text-navy">
              <Bell aria-hidden className="size-4" /> Following
            </p>
            <button
              type="button"
              className="link-action text-[0.9375rem]"
              disabled={pending}
              onClick={() => run(() => followAction(props.ticketId, false), "Unfollowed.")}
            >
              Unfollow
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary w-full"
            disabled={pending}
            onClick={() => run(() => followAction(props.ticketId, true), "Following. You'll get alerts on every change.")}
          >
            <Bell aria-hidden className="size-4" />
            Follow for updates
          </button>
        )}
        <p className="hint mt-2">
          {props.watchers} {props.watchers === 1 ? "person is" : "people are"} watching this
        </p>
      </div>

      <ActionMessage message={message} />
    </div>
  );
}
