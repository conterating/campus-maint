"use client";

import { useId, useState } from "react";
import { Loader2, UserPlus, Wand2 } from "lucide-react";
import { assignAction } from "@/app/actions";
import { autoAssignAction } from "@/app/schedule-actions";
import { useAction } from "@/components/useAction";

export type AssignChoice = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
};

/** Assign from the queue: only eligible contractors (and department staff) are listed. */
export function QuickAssign({ ticketId, label, choices, canAuto = true }: { ticketId: string; label: string; choices: AssignChoice[]; canAuto?: boolean }) {
  const { pending, message, run } = useAction();
  const id = useId();
  const [who, setWho] = useState(choices[0]?.id ?? "");
  const hint = choices.find((c) => c.id === who)?.hint;
  if (!choices.length)
    return (
      <span className="text-xs text-ink-3">
        No eligible contractor
        {message?.tone === "error" && (
          <span role="alert" className="mt-1 block font-bold text-emergency">
            {message.text}
          </span>
        )}
      </span>
    );
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
        {[...new Set(choices.map((c) => c.group ?? ""))].map((g) => {
          const options = choices
            .filter((c) => (c.group ?? "") === g)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ));
          return g ? (
            <optgroup key={g} label={g}>
              {options}
            </optgroup>
          ) : (
            options
          );
        })}
      </select>
      <button type="submit" className="btn btn-secondary btn-sm !min-h-8 !px-2.5 !text-xs" disabled={pending || !who} aria-label={`Assign ${label}`}>
        {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <UserPlus aria-hidden className="size-3.5" />}
        Assign
      </button>
      {canAuto && (
        <button
          type="button"
          className="btn btn-accent btn-sm !min-h-8 !px-2.5 !text-xs"
          disabled={pending}
          onClick={() => run(() => autoAssignAction(ticketId))}
          aria-label={`Auto-assign ${label}`}
          title={hint ? `Top pick: ${hint}` : "Let the scheduler pick"}
        >
          <Wand2 aria-hidden className="size-3.5" />
          Auto
        </button>
      )}
      {message?.tone === "error" && (
        <p role="alert" className="mt-1 text-xs font-bold text-emergency">
          {message.text}
        </p>
      )}
    </form>
  );
}
