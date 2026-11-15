"use client";

import { useId, useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2, RotateCcw, Users } from "lucide-react";
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
  watchers: number;
}) {
  const { pending, message, run } = useAction();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const canCloseOut = props.isReporter || props.isOwner;

  return (
    <div className="card p-4">
      {props.status === "RESOLVED" && canCloseOut && !reopening && (
        <div className="mb-4 rounded-[8px] bg-[#ecfdf3] p-3.5 ring-1 ring-inset ring-resolved/20">
          <p className="font-bold text-ink">Staff marked this fixed. Is it?</p>
          <p className="mt-0.5 text-sm text-ink-2">Confirming closes the ticket. If it&apos;s still broken, reopen it and tell them what&apos;s wrong.</p>
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
        <button type="button" className="btn btn-secondary mb-3 w-full" onClick={() => setReopening(true)} aria-expanded={reopening}>
          <RotateCcw aria-hidden className="size-4" /> It broke again — reopen
        </button>
      )}

      {reopening && (
        <form
          className="mb-4"
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

      {props.canMeToo && (
        <div className="mb-3">
          {props.meToo ? (
            <p className="flex items-center gap-2 rounded-[8px] bg-navy-50 px-3 py-2.5 text-sm font-bold text-navy">
              <Users aria-hidden className="size-4" /> You said “me too” on this.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-accent w-full"
                disabled={pending}
                onClick={() =>
                  run(
                    () => meTooAction(props.ticketId),
                    (d) => (d.raisedTo ? `Counted. That pushed its priority up to ${d.raisedTo.toLowerCase()}.` : "Counted. You're following it now."),
                  )
                }
              >
                {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Users aria-hidden className="size-4" />}
                Me too
              </button>
              <p className="hint mt-1.5 text-center">Raises its priority and follows it for you.</p>
            </>
          )}
        </div>
      )}

      {props.isOwner ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Bell aria-hidden className="size-4 text-ink-3" /> You own this ticket, so you get every update.
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full"
          aria-pressed={props.following}
          disabled={pending}
          onClick={() => run(() => followAction(props.ticketId, !props.following), (d) => (d.following ? "Following. You'll get alerts on every change." : "Unfollowed."))}
        >
          {props.following ? <BellOff aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
          {props.following ? "Following · tap to stop" : "Follow for updates"}
        </button>
      )}
      <p className="hint mt-2.5 text-center">
        {props.watchers} {props.watchers === 1 ? "person is" : "people are"} watching this
      </p>

      <ActionMessage message={message} />
    </div>
  );
}
