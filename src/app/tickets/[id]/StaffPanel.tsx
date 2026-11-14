"use client";

import { useId, useState } from "react";
import { ArrowRightLeft, ChevronDown, MessageSquarePlus, PencilLine, Wrench } from "lucide-react";
import { staffNoteAction, staffOverrideAction, staffReassignAction, staffStatusAction } from "@/app/actions";
import { CATEGORIES, CATEGORY_LABEL, DEPARTMENTS, DEPARTMENT_LABEL, SEVERITIES, SEVERITY_LABEL, STAFF_SETTABLE_STATUSES, STATUS_LABEL, type Department } from "@/lib/domain";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";

type Ticket = { id: string; status: string; category: string; severity: string; summary: string; department: string; assigneeId: string | null };
type Staff = { id: string; name: string; isSupervisor: boolean };

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: typeof Wrench; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-t border-line" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-bold text-ink hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className="size-4 text-ink-3" />
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-4 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function StaffPanel({ ticket, staff, viewerId }: { ticket: Ticket; staff: Staff[]; viewerId: string }) {
  const { pending, message, run } = useAction();
  const id = { status: useId(), assignee: useId(), statusNote: useId(), dept: useId(), deptReason: useId(), cat: useId(), sev: useId(), sum: useId(), why: useId(), note: useId() };
  const closed = ticket.status === "CONFIRMED";

  const nextStatus = ticket.status === "TRIAGED" || ticket.status === "SUBMITTED" || ticket.status === "REOPENED" ? "ASSIGNED" : ticket.status === "ASSIGNED" ? "IN_PROGRESS" : "RESOLVED";
  const [status, setStatus] = useState<string>(nextStatus);
  const [assignee, setAssignee] = useState(ticket.assigneeId ?? (staff.some((s) => s.id === viewerId) ? viewerId : staff[0]?.id ?? ""));
  const [statusNote, setStatusNote] = useState("");
  const [dept, setDept] = useState<string>(DEPARTMENTS.find((d) => d !== ticket.department) ?? "FACILITIES");
  const [deptReason, setDeptReason] = useState("");
  const [cat, setCat] = useState(ticket.category);
  const [sev, setSev] = useState(ticket.severity);
  const [sum, setSum] = useState(ticket.summary);
  const [why, setWhy] = useState("");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <h2 className="h-section">Staff controls</h2>
        <p className="hint mt-0.5">{DEPARTMENT_LABEL[ticket.department as Department]} queue</p>
        {closed && <p className="mt-2 text-sm text-ink-2">The reporter confirmed this fix. They can reopen it if it breaks again.</p>}
      </div>

      <Section title="Update status" icon={Wrench} defaultOpen={!closed}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => staffStatusAction(ticket.id, status, statusNote, status === "ASSIGNED" ? assignee : undefined),
              `Updated to ${STATUS_LABEL[status as keyof typeof STATUS_LABEL].toLowerCase()}. Followers notified.`,
              () => setStatusNote(""),
            );
          }}
        >
          <div>
            <label htmlFor={id.status} className="label">
              New status
            </label>
            <select id={id.status} className="field" value={status} onChange={(e) => setStatus(e.target.value)} disabled={closed}>
              {STAFF_SETTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                  {s === ticket.status ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          {status === "ASSIGNED" && (
            <div>
              <label htmlFor={id.assignee} className="label">
                Assign to
              </label>
              <select id={id.assignee} className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isSupervisor ? " (supervisor)" : ""}
                    {s.id === viewerId ? " — me" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={id.statusNote} className="label">
              Message to the reporter <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <textarea id={id.statusNote} className="field min-h-[4.5rem]" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="e.g. Coming by at 3pm." disabled={closed} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={pending || closed}>
            Save status
          </button>
        </form>
      </Section>

      <Section title="Reassign department" icon={ArrowRightLeft}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => staffReassignAction(ticket.id, dept, deptReason), `Moved to ${DEPARTMENT_LABEL[dept as Department]}.`);
          }}
        >
          <div>
            <label htmlFor={id.dept} className="label">
              Send to
            </label>
            <select id={id.dept} className="field" value={dept} onChange={(e) => setDept(e.target.value)}>
              {DEPARTMENTS.filter((d) => d !== ticket.department).map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id.deptReason} className="label">
              Why <span className="font-normal text-ink-3">(shown in the activity)</span>
            </label>
            <input id={id.deptReason} className="field" value={deptReason} onChange={(e) => setDeptReason(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-secondary w-full" disabled={pending}>
            Reassign
          </button>
        </form>
      </Section>

      <Section title="Correct the classification" icon={PencilLine}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => staffOverrideAction(ticket.id, { category: cat, severity: sev, summary: sum, reason: why }), "Classification updated.", () => setWhy(""));
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={id.cat} className="label">
                Category
              </label>
              <select id={id.cat} className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id.sev} className="label">
                Severity
              </label>
              <select id={id.sev} className="field" value={sev} onChange={(e) => setSev(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={id.sum} className="label">
              Summary
            </label>
            <input id={id.sum} className="field" value={sum} maxLength={120} onChange={(e) => setSum(e.target.value)} />
          </div>
          <div>
            <label htmlFor={id.why} className="label">
              Reason <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input id={id.why} className="field" value={why} onChange={(e) => setWhy(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-secondary w-full" disabled={pending}>
            Save classification
          </button>
        </form>
      </Section>

      <Section title="Add a note" icon={MessageSquarePlus}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => staffNoteAction(ticket.id, note, internal), internal ? "Internal note saved." : "Note posted. Followers notified.", () => setNote(""));
          }}
        >
          <div>
            <label htmlFor={id.note} className="label">
              Note
            </label>
            <textarea id={id.note} className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} required />
          </div>
          <label className="flex items-start gap-2.5 text-sm text-ink-2">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="mt-0.5 size-4 accent-[var(--navy)]" />
            <span>
              <span className="font-bold text-ink">Internal only.</span> Hidden from students; doesn&apos;t count as a response.
            </span>
          </label>
          <button type="submit" className="btn btn-secondary w-full" disabled={pending}>
            {internal ? "Save internal note" : "Post note"}
          </button>
        </form>
      </Section>

      <div className="px-4 pb-4 empty:hidden">
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
