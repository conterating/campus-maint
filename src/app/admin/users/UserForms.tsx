"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffAccountAction,
  residenceAction,
  resendInviteAction,
  sendResetAction,
  setDisabledAction,
  updateStaffAccountAction,
} from "@/app/admin/actions";
import { Checkbox, ErrorSummary, Field, StatusMessage } from "@/components/forms";
import { DEPARTMENTS, DEPARTMENT_LABEL, STAFF_PERMISSIONS, STAFF_PERMISSION_LABEL, type StaffPermission } from "@/lib/domain";
import type { HallOption } from "@/lib/residences";

type Perms = Record<StaffPermission, boolean>;
const DEFAULT_PERMS: Perms = { canManageUsers: false, canManageContractors: false, canVerifyResidence: false, canViewAnalytics: false, canAssignWork: true };

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

function PermissionBoxes({ value, onChange, idPrefix, disabled }: { value: Perms; onChange: (p: Perms) => void; idPrefix: string; disabled?: boolean }) {
  return (
    <fieldset>
      <legend className="label">Permissions</legend>
      {disabled && <p className="hint mb-1.5">Only an administrator can change permissions.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {STAFF_PERMISSIONS.map((p) => (
          <Checkbox key={p} id={`${idPrefix}-${p}`} checked={value[p]} onChange={(c) => !disabled && onChange({ ...value, [p]: c })}>
            {STAFF_PERMISSION_LABEL[p]}
          </Checkbox>
        ))}
      </div>
    </fieldset>
  );
}

export function CreateStaffForm({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const blank = { role: "STAFF", firstName: "", lastName: "", preferredName: "", username: "", gtId: "", department: "HOUSING", isSupervisor: false, employeeId: "", title: "", officePhone: "", officeLocation: "", phone: "" };
  const [v, setV] = useState(blank);
  const [perms, setPerms] = useState<Perms>(DEFAULT_PERMS);
  const f = useForm();
  const set = (k: keyof typeof blank, val: string | boolean) => setV((p) => ({ ...p, [k]: val }));

  if (!open) {
    return (
      <>
        <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setOpen(true)}>
          Add staff member
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
        f.submit(
          () => createStaffAccountAction({ ...v, department: v.department || undefined, ...perms }),
          `Account created for ${v.firstName}. We emailed them an invite.`,
          () => {
            setV(blank);
            setPerms(DEFAULT_PERMS);
            setOpen(false);
          },
        );
      }}
    >
      <ErrorSummary errors={f.errors} message={f.errors.form} version={f.version} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="role" label="Role" error={f.errors.role}>
          {(a) => (
            <select {...a} className="field" value={v.role} onChange={(e) => set("role", e.target.value)}>
              <option value="STAFF">Staff</option>
              {isAdmin && <option value="ADMIN">Administrator</option>}
            </select>
          )}
        </Field>
        <Field id="department" label="Department" optional={v.role === "ADMIN"} error={f.errors.department}>
          {(a) => (
            <select {...a} className="field" value={v.department} onChange={(e) => set("department", e.target.value)}>
              {v.role === "ADMIN" && <option value="">None (all departments)</option>}
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex items-end pb-2.5">
          <Checkbox id="isSupervisor" checked={v.isSupervisor} onChange={(c) => set("isSupervisor", c)}>
            Supervisor (gets escalations)
          </Checkbox>
        </div>
        <Field id="firstName" label="First name" error={f.errors.firstName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />}
        </Field>
        <Field id="lastName" label="Last name" error={f.errors.lastName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />}
        </Field>
        <Field id="preferredName" label="Preferred name" optional error={f.errors.preferredName}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.preferredName} onChange={(e) => set("preferredName", e.target.value)} />}
        </Field>
        <Field id="username" label="Username" error={f.errors.username}>
          {(a) => <input {...a} className="field" autoComplete="off" autoCapitalize="none" value={v.username} onChange={(e) => set("username", e.target.value)} />}
        </Field>
        <Field id="gtId" label="GT ID" error={f.errors.gtId}>
          {(a) => <input {...a} className="field num" inputMode="numeric" autoComplete="off" value={v.gtId} onChange={(e) => set("gtId", e.target.value)} />}
        </Field>
        <Field id="employeeId" label="Employee ID" error={f.errors.employeeId}>
          {(a) => <input {...a} className="field" autoComplete="off" value={v.employeeId} onChange={(e) => set("employeeId", e.target.value)} />}
        </Field>
        <Field id="title" label="Job title" error={f.errors.title} className="sm:col-span-2">
          {(a) => <input {...a} className="field" autoComplete="off" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Housing Maintenance Supervisor" />}
        </Field>
        <Field id="phone" label="Mobile phone" optional error={f.errors.phone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="off" value={v.phone} onChange={(e) => set("phone", e.target.value)} />}
        </Field>
        <Field id="officePhone" label="Office phone" optional error={f.errors.officePhone}>
          {(a) => <input {...a} className="field" type="tel" autoComplete="off" value={v.officePhone} onChange={(e) => set("officePhone", e.target.value)} />}
        </Field>
        <Field id="officeLocation" label="Office location" optional error={f.errors.officeLocation} className="sm:col-span-2">
          {(a) => <input {...a} className="field" autoComplete="off" value={v.officeLocation} onChange={(e) => set("officeLocation", e.target.value)} />}
        </Field>
      </div>
      <PermissionBoxes value={perms} onChange={setPerms} idPrefix="new" disabled={!isAdmin} />
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

type RowUser = {
  id: string;
  name: string;
  role: "STUDENT" | "CONTRACTOR" | "STAFF" | "ADMIN";
  department: string;
  isSupervisor: boolean;
  disabled: boolean;
  invitePending: boolean;
  title: string;
  perms: Perms;
};

export function UserRowActions({ user, isAdmin }: { user: RowUser; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [department, setDepartment] = useState(user.department || "HOUSING");
  const [isSupervisor, setSupervisor] = useState(user.isSupervisor);
  const [title, setTitle] = useState(user.title);
  const [perms, setPerms] = useState(user.perms);
  const f = useForm();
  const prefix = `u-${user.id}`;
  const staffLike = role === "STAFF" || role === "ADMIN";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {(user.role === "STAFF" || user.role === "ADMIN") && (
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
            Edit<span className="sr-only"> {user.name}</span>
          </button>
        )}
        {user.invitePending && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={f.pending} onClick={() => f.submit(() => resendInviteAction(user.id), "Invite sent again.")}>
            Resend invite
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={f.pending} onClick={() => f.submit(() => sendResetAction(user.id), "Password reset email sent.")}>
          Send reset<span className="sr-only"> to {user.name}</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${user.disabled ? "btn-secondary" : "btn-ghost text-emergency"}`}
          disabled={f.pending}
          onClick={() => f.submit(() => setDisabledAction(user.id, !user.disabled), user.disabled ? "Account enabled." : "Account disabled and signed out.")}
        >
          {user.disabled ? "Enable" : "Disable"}
          <span className="sr-only"> {user.name}</span>
        </button>
      </div>
      <StatusMessage>{f.status}</StatusMessage>
      {f.errors.form && !editing && <StatusMessage tone="error">{f.errors.form}</StatusMessage>}
      {editing && (
        <form
          noValidate
          className="mt-2 w-full max-w-xl space-y-3 rounded-[12px] bg-surface-2 p-4 text-left ring-1 ring-line"
          onSubmit={(e) => {
            e.preventDefault();
            f.submit(
              () => updateStaffAccountAction({ userId: user.id, role, department: staffLike ? department || undefined : undefined, isSupervisor, title, ...perms }),
              "Saved. They were signed out so the change takes effect.",
              () => setEditing(false),
            );
          }}
        >
          <ErrorSummary errors={f.errors} message={f.errors.form} version={f.version} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${prefix}-role`} label="Role" error={f.errors.role}>
              {(a) => (
                <select {...a} className="field" value={role} onChange={(e) => setRole(e.target.value as RowUser["role"])}>
                  <option value="STAFF">Staff</option>
                  {isAdmin && <option value="ADMIN">Administrator</option>}
                </select>
              )}
            </Field>
            <Field id={`${prefix}-dept`} label="Department" error={f.errors.department}>
              {(a) => (
                <select {...a} className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {role === "ADMIN" && <option value="">None</option>}
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {DEPARTMENT_LABEL[d]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id={`${prefix}-title`} label="Job title" error={f.errors.title}>
              {(a) => <input {...a} className="field" value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <div className="flex items-end pb-2.5">
              <Checkbox id={`${prefix}-sup`} checked={isSupervisor} onChange={setSupervisor}>
                Supervisor
              </Checkbox>
            </div>
          </div>
          <PermissionBoxes value={perms} onChange={setPerms} idPrefix={prefix} disabled={!isAdmin} />
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

export function ResidenceDecision({
  user,
  halls,
}: {
  user: { id: string; name: string; username: string; hall: string; room: string; residenceBuildingId: string; roomId: string };
  halls: HallOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [hallId, setHallId] = useState(user.residenceBuildingId);
  const [roomId, setRoomId] = useState(user.roomId);
  const f = useForm();
  const hall = halls.find((h) => h.id === hallId);
  const prefix = `res-${user.id}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-ink">
            {user.name} <span className="font-normal text-ink-3">@{user.username}</span>
          </p>
          <p className="text-sm text-ink-2">
            Says they live in {user.hall}, {user.room}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-success btn-sm" disabled={f.pending} onClick={() => f.submit(() => residenceAction({ userId: user.id, decision: "verify" }), `${user.name}'s room is confirmed.`)}>
            Verify<span className="sr-only"> {user.name}</span>
          </button>
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
            Edit<span className="sr-only"> {user.name}&apos;s room</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-emergency" disabled={f.pending} onClick={() => f.submit(() => residenceAction({ userId: user.id, decision: "reject" }), `Rejected. ${user.name} was asked to update their residence.`)}>
            Reject<span className="sr-only"> {user.name}</span>
          </button>
        </div>
      </div>
      <StatusMessage>{f.status}</StatusMessage>
      {f.errors.form && <StatusMessage tone="error">{f.errors.form}</StatusMessage>}
      {editing && (
        <form
          noValidate
          className="mt-3 grid gap-3 rounded-[12px] bg-surface-2 p-4 ring-1 ring-line sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            f.submit(() => residenceAction({ userId: user.id, decision: "edit", residenceBuildingId: hallId, roomId }), "Room corrected and confirmed.", () => setEditing(false));
          }}
        >
          <Field id={`${prefix}-hall`} label="Residence hall">
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
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={`${prefix}-room`} label="Room">
            {(a) => (
              <select {...a} className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">Choose a room</option>
                {hall?.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button type="submit" className="btn btn-primary" disabled={f.pending || !roomId}>
            Save and verify
          </button>
        </form>
      )}
    </div>
  );
}
