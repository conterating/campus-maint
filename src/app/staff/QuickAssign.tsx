"use client";

import { useId, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { assignAction } from "@/app/actions";
import { useAction } from "@/components/useAction";

export type AssignChoice = { id: string; label: string };

/** Assign from the queue: only eligible contractors (and department staff) are listed. */
export function QuickAssign({ ticketId, label, choices }: { ticketId: string; label: string; choices: AssignChoice[] }) {
  const { pending, message, run } = useAction();
  const id = useId();
  const [who, setWho] = useState(choices[0]?.id ?? "");
  if (!choices.length) return <span className="text-xs text-ink-3">No eligible contractor</span>;
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => assignAction(ticketId, who));
      }}
    >
      <label htmlFor={id} className="sr-only">
        Assign {label} to
      </label>
      <select id={id} className="field !min-h-8 max-w-44 !py-1 !pl-2 !text-xs" value={who} onChange={(e) => setWho(e.target.value)} disabled={pending}>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary btn-sm !min-h-8 !px-2.5 !text-xs" disabled={pending || !who} aria-label={`Assign ${label}`}>
        {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <UserPlus aria-hidden className="size-3.5" />}
        Assign
      </button>
      {message?.tone === "error" && (
        <p role="alert" className="mt-1 text-xs font-bold text-emergency">
          {message.text}
        </p>
      )}
    </form>
  );
}
