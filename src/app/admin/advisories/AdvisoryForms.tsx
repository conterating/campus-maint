"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";
import { clearAdvisoryAction, postAdvisoryAction } from "@/app/advisory-actions";
import { ADVISORY_LIMITS, ADVISORY_SEVERITIES, ADVISORY_SEVERITY_LABEL, type AdvisorySeverity } from "@/lib/advisories";

export function AdvisoryForm({ buildings }: { buildings: { id: string; name: string }[] }) {
  const router = useRouter();
  const { pending, message, run } = useAction();
  const [severity, setSeverity] = useState<AdvisorySeverity>("WARNING");
  const [formKey, setFormKey] = useState(0);

  function submit(fd: FormData) {
    const ends = String(fd.get("endsAt") ?? "");
    run(
      () =>
        postAdvisoryAction({
          title: String(fd.get("title") ?? ""),
          message: String(fd.get("message") ?? ""),
          severity,
          buildingId: String(fd.get("buildingId") ?? ""),
          area: String(fd.get("area") ?? ""),
          startsAt: "",
          // datetime-local is the browser's local time; the server gets an absolute instant.
          endsAt: ends ? new Date(ends).toISOString() : "",
          lat: "",
          lng: "",
        }),
      "Advisory posted. Everyone has been alerted.",
      () => {
        setFormKey((k) => k + 1);
        router.refresh();
      },
    );
  }

  return (
    <form key={formKey} action={submit} className="mt-5 grid gap-5">
      <div>
        <label htmlFor="adv-title" className="label">Title</label>
        <input id="adv-title" name="title" required maxLength={ADVISORY_LIMITS.title} className="field" placeholder="Avoid Ferst Drive near the Student Center" />
      </div>
      <div>
        <label htmlFor="adv-message" className="label">What is happening and what should people do?</label>
        <textarea id="adv-message" name="message" required rows={4} maxLength={ADVISORY_LIMITS.message} className="field" />
      </div>
      <fieldset>
        <legend className="label">Severity</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {ADVISORY_SEVERITIES.map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-2 text-[0.9375rem]">
              <input type="radio" name="severity" value={s} checked={severity === s} onChange={() => setSeverity(s)} className="size-4 accent-[var(--navy)]" />
              {ADVISORY_SEVERITY_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="adv-building" className="label">Building (optional)</label>
          <select id="adv-building" name="buildingId" defaultValue="" className="field">
            <option value="">None</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="adv-area" className="label">Area (optional if a building is picked)</label>
          <input id="adv-area" name="area" maxLength={ADVISORY_LIMITS.area} className="field" placeholder="Ferst Drive between Atlantic and Hemphill" />
        </div>
      </div>
      <div className="sm:max-w-xs">
        <label htmlFor="adv-ends" className="label">Ends (optional)</label>
        <input id="adv-ends" name="endsAt" type="datetime-local" className="field" />
        <p className="hint mt-1">Leave blank to keep it up until someone clears it.</p>
      </div>
      <div>
        <button type="submit" disabled={pending} className={`btn ${severity === "EMERGENCY" ? "btn-danger" : "btn-primary"}`}>
          {pending ? "Posting…" : "Post advisory"}
        </button>
        <ActionMessage message={message} />
      </div>
    </form>
  );
}

export function ClearAdvisoryButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const { pending, message, run } = useAction();
  return (
    <div>
      <button type="button" disabled={pending} aria-label={`Clear advisory: ${title}`} className="btn btn-secondary" onClick={() => run(() => clearAdvisoryAction(id), undefined, () => router.refresh())}>
        {pending ? "Clearing…" : "Clear"}
      </button>
      <ActionMessage message={message} />
    </div>
  );
}
