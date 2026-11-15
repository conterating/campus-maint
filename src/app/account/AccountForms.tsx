"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestResidenceChangeAction, signOutEverywhereAction, updateProfileAction } from "@/app/auth-actions";
import { ErrorSummary, Field, StatusMessage } from "@/components/forms";
import { GENDERS, GENDER_LABEL } from "@/lib/domain";
import { OFF_CAMPUS } from "@/lib/auth-schemas";
import type { HallOption } from "@/lib/residences";

type Profile = { preferredName: string; phone: string; gender: string; genderSelfDescribe: string };

export function ProfileForm({ initial, isStudent }: { initial: Profile; isStudent: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof Profile, val: string) => {
    setSaved(false);
    setV((p) => ({ ...p, [k]: val }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateProfileAction(v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? { form: res.error });
        setVersion((n) => n + 1);
        return;
      }
      setErrors({});
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <ErrorSummary errors={errors} message={errors.form} version={version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="preferredName" label="Preferred name" optional error={errors.preferredName}>
          {(a) => <input {...a} className="field" autoComplete="nickname" value={v.preferredName} onChange={(e) => set("preferredName", e.target.value)} />}
        </Field>
        <Field id="phone" label="Phone" optional error={errors.phone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />}
        </Field>
      </div>
      {isStudent && (
        <>
          <Field id="gender" label="Gender" optional hint="Optional. Never shown to other students or contractors." error={errors.gender}>
            {(a) => (
              <select {...a} className="field" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Not specified</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {v.gender === "SELF_DESCRIBE" && (
            <Field id="genderSelfDescribe" label="Describe your gender" error={errors.genderSelfDescribe}>
              {(a) => <input {...a} className="field" value={v.genderSelfDescribe} onChange={(e) => set("genderSelfDescribe", e.target.value)} />}
            </Field>
          )}
        </>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      <StatusMessage>{saved ? "Saved." : null}</StatusMessage>
    </form>
  );
}

export function ResidenceForm({ halls, current }: { halls: HallOption[]; current: { residenceBuildingId: string; roomId: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hallId, setHallId] = useState(current.residenceBuildingId || OFF_CAMPUS);
  const [roomId, setRoomId] = useState(current.roomId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const hall = halls.find((h) => h.id === hallId);

  if (!open) {
    return (
      <>
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setOpen(true)}>
          I moved: change my residence
        </button>
        <StatusMessage>{done ? "Saved. Housing will confirm your new room." : null}</StatusMessage>
      </>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await requestResidenceChangeAction({ residenceBuildingId: hallId, roomId });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? { form: res.error });
        setVersion((n) => n + 1);
        return;
      }
      setOpen(false);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <p className="text-sm text-ink-2">Changing your residence means Housing confirms it again. Until then you&apos;ll only see issues in public buildings and your own reports.</p>
      <ErrorSummary errors={errors} message={errors.form} version={version} />
      <Field id="residenceBuildingId" label="Residence hall" error={errors.residenceBuildingId}>
        {(a) => (
          <select
            {...a}
            className="field"
            value={hallId}
            onChange={(e) => {
              setHallId(e.target.value);
              setRoomId("");
            }}
          >
            <option value={OFF_CAMPUS}>Off campus</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {hallId !== OFF_CAMPUS && (
        <Field id="roomId" label="Room number" error={errors.roomId}>
          {(a) => (
            <select {...a} className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Choose your room</option>
              {hall?.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save and send to Housing"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SessionsPanel({ count }: { count: number }) {
  return (
    <form action={signOutEverywhereAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <p className="text-sm text-ink-2">
        You&apos;re signed in on <span className="font-bold text-ink">{count}</span> {count === 1 ? "device" : "devices"}.
      </p>
      <button type="submit" className="btn btn-secondary btn-sm">
        Sign out of all devices
      </button>
    </form>
  );
}
