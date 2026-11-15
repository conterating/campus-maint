"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContractorAction, deactivateContractorAction, resendInviteAction, updateContractorAction } from "@/app/admin/actions";
import { Checkbox, ErrorSummary, Field, StatusMessage } from "@/components/forms";
import {
  BACKGROUND_CHECK_LABEL,
  BACKGROUND_CHECK_STATUSES,
  CATEGORIES,
  CATEGORY_LABEL,
  DEPARTMENTS,
  DEPARTMENT_LABEL,
  type BackgroundCheckStatus,
  type Category,
  type Department,
} from "@/lib/domain";

export type ContractorFormValues = {
  companyName: string;
  companyPhone: string;
  trades: Category[];
  departments: Department[];
  licenseNumber: string;
  licenseExpiresAt: string;
  insuranceExpiresAt: string;
  backgroundCheckStatus: BackgroundCheckStatus;
  backgroundCheckedAt: string;
  residenceHallAccess: boolean;
  maxActiveJobs: string;
  hourlyRate: string;
  contractStartsAt: string;
  contractEndsAt: string;
};

const EMPTY: ContractorFormValues = {
  companyName: "",
  companyPhone: "",
  trades: [],
  departments: [],
  licenseNumber: "",
  licenseExpiresAt: "",
  insuranceExpiresAt: "",
  backgroundCheckStatus: "PENDING",
  backgroundCheckedAt: "",
  residenceHallAccess: false,
  maxActiveJobs: "5",
  hourlyRate: "",
  contractStartsAt: "",
  contractEndsAt: "",
};

function useForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(fn: () => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }>, success: string, after?: () => void) {
    setStatus(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? { form: res.error });
        setVersion((n) => n + 1);
        return;
      }
      setErrors({});
      setStatus(success);
      after?.();
      router.refresh();
    });
  }
  return { errors, version, status, pending, submit };
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...new Set([...list, item])] : list.filter((x) => x !== item);
}

/** Field ids take a prefix so several editors can share a page; error links point at the first one. */
function ProfileFields({ v, set, errors, prefix, isAdmin }: { v: ContractorFormValues; set: <K extends keyof ContractorFormValues>(k: K, val: ContractorFormValues[K]) => void; errors: Record<string, string>; prefix: string; isAdmin: boolean }) {
  const id = (k: string) => (prefix ? `${prefix}-${k}` : k);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("companyName")} label="Company" error={errors.companyName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.companyName} onChange={(e) => set("companyName", e.target.value)} />}
        </Field>
        <Field id={id("companyPhone")} label="Company phone" optional error={errors.companyPhone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="off" value={v.companyPhone} onChange={(e) => set("companyPhone", e.target.value)} />}
        </Field>
      </div>
      <fieldset id={id("trades")}>
        <legend className="label">Trades</legend>
        {errors.trades && <p className="mb-1.5 text-sm font-bold text-emergency">{errors.trades}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Checkbox key={c} id={`${id("trade")}-${c}`} checked={v.trades.includes(c)} onChange={(on) => set("trades", toggle(v.trades, c, on))}>
              {CATEGORY_LABEL[c]}
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <fieldset id={id("departments")}>
        <legend className="label">Works for</legend>
        {errors.departments && <p className="mb-1.5 text-sm font-bold text-emergency">{errors.departments}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPARTMENTS.map((d) => (
            <Checkbox key={d} id={`${id("dept")}-${d}`} checked={v.departments.includes(d)} onChange={(on) => set("departments", toggle(v.departments, d, on))}>
              {DEPARTMENT_LABEL[d]}
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={id("licenseNumber")} label="License number" optional error={errors.licenseNumber}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} />}
        </Field>
        <Field id={id("licenseExpiresAt")} label="License expires" error={errors.licenseExpiresAt}>
          {(a) => <input {...a} className="field" type="date" value={v.licenseExpiresAt} onChange={(e) => set("licenseExpiresAt", e.target.value)} />}
        </Field>
        <Field id={id("insuranceExpiresAt")} label="Insurance expires" error={errors.insuranceExpiresAt}>
          {(a) => <input {...a} className="field" type="date" value={v.insuranceExpiresAt} onChange={(e) => set("insuranceExpiresAt", e.target.value)} />}
        </Field>
        <Field id={id("backgroundCheckStatus")} label="Background check" error={errors.backgroundCheckStatus}>
          {(a) => (
            <select {...a} className="field" value={v.backgroundCheckStatus} onChange={(e) => set("backgroundCheckStatus", e.target.value as BackgroundCheckStatus)}>
              {BACKGROUND_CHECK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BACKGROUND_CHECK_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={id("backgroundCheckedAt")} label="Checked on" optional error={errors.backgroundCheckedAt}>
          {(a) => <input {...a} className="field" type="date" value={v.backgroundCheckedAt} onChange={(e) => set("backgroundCheckedAt", e.target.value)} />}
        </Field>
        <Field id={id("maxActiveJobs")} label="Max active jobs" error={errors.maxActiveJobs}>
          {(a) => <input {...a} className="field num" inputMode="numeric" value={v.maxActiveJobs} onChange={(e) => set("maxActiveJobs", e.target.value)} />}
        </Field>
        <Field id={id("contractStartsAt")} label="Contract starts" optional error={errors.contractStartsAt}>
          {(a) => <input {...a} className="field" type="date" value={v.contractStartsAt} onChange={(e) => set("contractStartsAt", e.target.value)} />}
        </Field>
        <Field id={id("contractEndsAt")} label="Contract ends" optional error={errors.contractEndsAt}>
          {(a) => <input {...a} className="field" type="date" value={v.contractEndsAt} onChange={(e) => set("contractEndsAt", e.target.value)} />}
        </Field>
        {isAdmin && (
          <Field id={id("hourlyRate")} label="Hourly rate (USD)" optional hint="Visible to administrators only." error={errors.hourlyRate}>
            {(a) => <input {...a} className="field num" inputMode="decimal" value={v.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} />}
          </Field>
        )}
      </div>
      <Checkbox id={id("residenceHallAccess")} checked={v.residenceHallAccess} onChange={(c) => set("residenceHallAccess", c)}>
        Cleared to work inside residence halls (student rooms and shared areas)
      </Checkbox>
    </>
  );
}

const payload = (v: ContractorFormValues) => ({ ...v, maxActiveJobs: v.maxActiveJobs, hourlyRate: v.hourlyRate || undefined });

export function CreateContractorForm({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const blankId = { firstName: "", lastName: "", username: "", email: "", phone: "", contractorId: "" };
  const [who, setWho] = useState(blankId);
  const [v, setV] = useState<ContractorFormValues>(EMPTY);
  const f = useForm();
  const set = <K extends keyof ContractorFormValues>(k: K, val: ContractorFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const setW = (k: keyof typeof blankId, val: string) => setWho((p) => ({ ...p, [k]: val }));

  if (!open) {
    return (
      <>
        <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setOpen(true)}>
          Add contractor
        </button>
        <StatusMessage>{f.status}</StatusMessage>
      </>
    );
  }
  return (
    <form
      noValidate
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        f.submit(() => createContractorAction({ ...who, ...payload(v) }), `Contractor ${who.firstName} ${who.lastName} created. We emailed them an invite.`, () => {
          setOpen(false);
          setWho(blankId);
          setV(EMPTY);
        });
      }}
    >
      <ErrorSummary errors={f.errors} message={f.errors.form} version={f.version} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="firstName" label="First name" error={f.errors.firstName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={who.firstName} onChange={(e) => setW("firstName", e.target.value)} />}
        </Field>
        <Field id="lastName" label="Last name" error={f.errors.lastName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={who.lastName} onChange={(e) => setW("lastName", e.target.value)} />}
        </Field>
        <Field id="contractorId" label="Badge or vendor number" error={f.errors.contractorId}>
          {(a) => <input {...a} className="field" autoComplete="off" value={who.contractorId} onChange={(e) => setW("contractorId", e.target.value)} />}
        </Field>
        <Field id="username" label="Contractor username" hint="What they'll sign in with." error={f.errors.username}>
          {(a) => <input {...a} className="field" autoComplete="off" autoCapitalize="none" value={who.username} onChange={(e) => setW("username", e.target.value)} />}
        </Field>
        <Field id="email" label="Email" hint="Where the invite goes." error={f.errors.email}>
          {(a) => <input {...a} className="field" type="email" autoComplete="off" value={who.email} onChange={(e) => setW("email", e.target.value)} />}
        </Field>
        <Field id="phone" label="Mobile phone" optional error={f.errors.phone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="off" value={who.phone} onChange={(e) => setW("phone", e.target.value)} />}
        </Field>
      </div>
      <ProfileFields v={v} set={set} errors={f.errors} prefix="" isAdmin={isAdmin} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={f.pending}>
          {f.pending ? "Creating…" : "Create and send invite"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ContractorEditor({ userId, name, values, isAdmin, active, invitePending }: { userId: string; name: string; values: ContractorFormValues; isAdmin: boolean; active: boolean; invitePending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [v, setV] = useState(values);
  const f = useForm();
  const set = <K extends keyof ContractorFormValues>(k: K, val: ContractorFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          Edit<span className="sr-only"> {name}</span>
        </button>
        {invitePending && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={f.pending} onClick={() => f.submit(() => resendInviteAction(userId), "Invite sent again.")}>
            Resend invite
          </button>
        )}
        {active &&
          (confirmEnd ? (
            <>
              <button type="button" className="btn btn-danger btn-sm" disabled={f.pending} onClick={() => f.submit(() => deactivateContractorAction(userId), `${name} deactivated. Their open jobs went back to the queue.`, () => setConfirmEnd(false))}>
                Yes, deactivate
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm text-emergency" onClick={() => setConfirmEnd(true)}>
              Deactivate<span className="sr-only"> {name}</span>
            </button>
          ))}
      </div>
      <StatusMessage>{f.status}</StatusMessage>
      {f.errors.form && !editing && <StatusMessage tone="error">{f.errors.form}</StatusMessage>}
      {editing && (
        <form
          noValidate
          className="mt-2 w-full space-y-4 rounded-[12px] bg-surface-2 p-4 ring-1 ring-line"
          onSubmit={(e) => {
            e.preventDefault();
            f.submit(() => updateContractorAction({ userId, ...payload(v) }), "Saved.", () => setEditing(false));
          }}
        >
          <ErrorSummary errors={f.errors} message={f.errors.form} version={f.version} />
          <ProfileFields v={v} set={set} errors={f.errors} prefix={`c-${userId}`} isAdmin={isAdmin} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={f.pending}>
              Save changes
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
