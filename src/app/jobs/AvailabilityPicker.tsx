"use client";

import { useId, useState } from "react";
import { setAvailabilityAction } from "@/app/actions";
import { AVAILABILITIES, AVAILABILITY_LABEL, type Availability } from "@/lib/domain";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";

export function AvailabilityPicker({ value }: { value: Availability }) {
  const id = useId();
  const [v, setV] = useState(value);
  const { pending, message, run } = useAction();
  return (
    <div className="min-w-48">
      <label htmlFor={id} className="label">
        Availability
      </label>
      <select
        id={id}
        className="field"
        value={v}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Availability;
          setV(next);
          run(() => setAvailabilityAction(next), `You're now ${AVAILABILITY_LABEL[next].toLowerCase()}.`);
        }}
      >
        {AVAILABILITIES.filter((a) => a !== "ON_BREAK" || v === "ON_BREAK").map((a) => (
          // Breaks go through "Start break" so they land on the calendar; "On a break" only shows while one is running.
          <option key={a} value={a} disabled={a === "ON_BREAK"}>
            {AVAILABILITY_LABEL[a]}
          </option>
        ))}
      </select>
      <ActionMessage message={message} />
    </div>
  );
}
