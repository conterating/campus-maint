"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Siren } from "lucide-react";
import { formatDuration } from "@/lib/sla";

/**
 * Live countdown to a ticket's first-response target. `serverNow` is the demo
 * clock's time when the page rendered; we track elapsed real time from there so
 * fast-forwarding the demo clock is reflected correctly.
 */
export function Countdown({
  dueAt,
  serverNow,
  respondedAt,
  closed,
  escalated,
  compact = false,
}: {
  dueAt: string;
  serverNow: string;
  respondedAt: string | null;
  closed: boolean;
  escalated: boolean;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 30_000);
    return () => clearInterval(id);
  }, [serverNow]);

  if (respondedAt) {
    if (compact) return null;
    const met = new Date(respondedAt).getTime() <= new Date(dueAt).getTime();
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${met ? "text-resolved" : "text-urgent"}`}>
        <CheckCircle2 aria-hidden className="size-4" />
        {met ? "Responded within target" : "Responded after target"}
      </span>
    );
  }
  if (closed) return null;

  const remaining = new Date(dueAt).getTime() - (new Date(serverNow).getTime() + elapsed);
  const overdue = remaining < 0;
  const soon = !overdue && remaining < 60 * 60 * 1000;
  const tone = overdue ? "text-emergency bg-emergency-bg ring-emergency/25" : soon ? "text-urgent bg-urgent-bg ring-urgent/25" : "text-ink-2 bg-surface-2 ring-line-2";

  return (
    <span className={`num inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold ring-1 ring-inset ${compact ? "text-xs" : "text-sm"} ${tone}`}>
      {overdue ? <Siren aria-hidden className="size-3.5" /> : <Clock aria-hidden className="size-3.5" />}
      {overdue ? (
        <span>
          Overdue {formatDuration(remaining)}
          {escalated && !compact ? " · escalated" : ""}
        </span>
      ) : (
        <span>
          <span className={compact ? "sr-only" : ""}>Response due in </span>
          {formatDuration(remaining)}
          {compact && <span className="sr-only"> until response is due</span>}
        </span>
      )}
    </span>
  );
}
