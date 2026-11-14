"use client";

import { Hand, Loader2 } from "lucide-react";
import { staffStatusAction } from "@/app/actions";
import { useAction } from "@/components/useAction";

/** One-tap "assign to me" from the queue. Counts as the first response. */
export function QuickAssign({ ticketId, label }: { ticketId: string; label: string }) {
  const { pending, message, run } = useAction();
  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-sm !min-h-8 !px-2.5 !text-xs"
        disabled={pending}
        onClick={() => run(() => staffStatusAction(ticketId, "ASSIGNED"))}
        aria-label={`Take it: assign ${label} to me`}
      >
        {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Hand aria-hidden className="size-3.5" />}
        Take it
      </button>
      {message?.tone === "error" && (
        <p role="alert" className="mt-1 text-xs font-bold text-emergency">
          {message.text}
        </p>
      )}
    </div>
  );
}
