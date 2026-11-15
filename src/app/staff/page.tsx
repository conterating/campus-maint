import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Map, QrCode, ShieldAlert, Siren, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listDepartmentQueue, shortName } from "@/lib/tickets";
import { compareQueue, isOverdue } from "@/lib/sla";
import { DEPARTMENTS, DEPARTMENT_LABEL, formatTicketNumber, isDepartment, isOpenStatus, type Department } from "@/lib/domain";
import { SeverityText, StatusPill } from "@/components/badges";
import { EmptyState } from "@/components/EmptyState";
import { placeText } from "@/components/WorkOrder";
import { Countdown } from "@/components/Countdown";
import { TicketList } from "@/components/TicketTag";
import { Avatar } from "@/components/Avatar";
import { hueFor } from "@/components/AppHeader";
import { QuickAssign } from "./QuickAssign";

export const metadata: Metadata = { title: "Staff queue" };

type Search = Promise<{ dept?: string; view?: string }>;

export default async function StaffPage({ searchParams }: { searchParams: Search }) {
  const { viewer, now } = await getContext();
  if (viewer.role === "STUDENT") redirect("/");
  const params = await searchParams;
  const dept: Department =
    viewer.role === "ADMIN" ? (isDepartment(params.dept) ? params.dept : "HOUSING") : ((viewer.department as Department) ?? "FACILITIES");
  const view = params.view === "closed" ? "closed" : "open";

  const all = await listDepartmentQueue(prisma, dept);
  const open = all.filter((t) => isOpenStatus(t.status)).sort((a, b) => compareQueue(a, b, now));
  const closed = all.filter((t) => !isOpenStatus(t.status)).sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
  const emergencies = open.filter((t) => t.severity === "EMERGENCY");
  const queue = open.filter((t) => t.severity !== "EMERGENCY");
  const overdue = open.filter((t) => isOverdue(t, now));
  const unassigned = open.filter((t) => !t.assigneeId);
  const escalatedToMe = viewer.isSupervisor ? overdue.filter((t) => t.escalatedAt) : [];
  const canAct = viewer.role === "ADMIN" || viewer.department === dept;
  const deptLink = (d: string, v = view) => `/staff?${viewer.role === "ADMIN" ? `dept=${d}&` : ""}view=${v}`;

  const stats = [
    { label: "Open", value: open.length, alert: false },
    { label: "Overdue", value: overdue.length, alert: overdue.length > 0 },
    { label: "Unassigned", value: unassigned.length, alert: false },
    { label: "Emergencies", value: emergencies.length, alert: emergencies.length > 0 },
  ];
  const rows = view === "open" ? queue : closed;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wo-label">{viewer.role === "ADMIN" ? "All departments" : `${viewer.name}${viewer.isSupervisor ? ", supervisor" : ""}`}</p>
          <h1 className="h-page mt-2">{DEPARTMENT_LABEL[dept]} queue</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/map" className="btn btn-secondary btn-sm">
            <Map aria-hidden className="size-4" /> Map
          </Link>
          <Link href="/qr" className="btn btn-secondary btn-sm">
            <QrCode aria-hidden className="size-4" /> QR codes
          </Link>
        </div>
      </div>

      {viewer.role === "ADMIN" && (
        <nav aria-label="Department" className="-mx-4 mt-6 overflow-x-auto px-4">
          <div className="seg flex min-w-max">
            {DEPARTMENTS.map((d) => (
              <Link key={d} href={deptLink(d)} aria-current={d === dept ? "page" : undefined}>
                {DEPARTMENT_LABEL[d]}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <dl className="mt-8 grid grid-cols-2 border-y-2 border-navy sm:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className={`px-1 py-4 sm:px-5 ${i % 2 ? "border-l border-line pl-4" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <dt className="wo-label">{s.label}</dt>
            <dd className={`mt-1 font-display text-[3.25rem] font-extrabold leading-[0.85] ${s.alert ? "text-emergency" : "text-navy"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {escalatedToMe.length > 0 && (
        <section aria-labelledby="esc-title" className="mt-8 rounded-[6px] border-2 border-emergency p-4">
          <h2 id="esc-title" className="flex items-center gap-2 font-display text-[1.375rem] font-extrabold uppercase leading-none text-emergency">
            <ShieldAlert aria-hidden className="size-5" /> Escalated to you
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-ink-2">These missed their response target. Assign someone or post an update to stop the clock.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {escalatedToMe.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 border-l-[3px] border-emergency py-2 pl-3 pr-2 hover:bg-emergency-bg">
                  <span className="num text-[1.0625rem] text-navy">{formatTicketNumber(t.number)}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{t.summary}</span>
                  <ArrowRight aria-hidden className="size-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {emergencies.length > 0 && view === "open" && (
        <section aria-labelledby="emerg-title" className="mt-8 overflow-hidden rounded-[6px] border-2 border-emergency">
          <div aria-hidden className="hazard h-2" />
          <div className="flex items-center gap-2 px-4 pt-3">
            <Siren aria-hidden className="size-5 text-emergency" />
            <h2 id="emerg-title" className="font-display text-[1.375rem] font-extrabold uppercase leading-none text-emergency">
              Emergencies skip the queue
            </h2>
          </div>
          <div className="px-2">
            <TicketList tickets={emergencies} now={now} bare showDue />
          </div>
        </section>
      )}

      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Queue view">
          <div className="seg">
            {(["open", "closed"] as const).map((v) => (
              <Link key={v} href={deptLink(dept, v)} aria-current={view === v ? "page" : undefined}>
                {v === "open" ? "Open" : "Resolved"} <span className="num text-[1.0625rem]">{v === "open" ? queue.length : closed.length}</span>
              </Link>
            ))}
          </div>
        </nav>
        <p className="pb-2 text-[0.9375rem] text-ink-3">{view === "open" ? "Sorted by severity, then time left to respond" : "Most recently resolved first"}</p>
      </div>

      {!rows.length ? (
        view === "open" ? (
          <EmptyState art="clipboard" title="Queue's clear">
            Nothing waiting. Go grab a coffee before someone finds a leak.
          </EmptyState>
        ) : (
          <EmptyState art="toolbox" title="Nothing resolved yet">
            Closed tickets show up here once a fix is marked done.
          </EmptyState>
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden md:block">
            <table className="w-full text-left text-[0.9375rem]">
              <caption className="sr-only">
                {DEPARTMENT_LABEL[dept]} {view === "open" ? "open tickets, sorted by severity then time remaining" : "resolved tickets"}
              </caption>
              <thead className="wo-label border-b-2 border-navy">
                <tr>
                  <th scope="col" className="py-2.5 pl-3 pr-2 font-bold">No.</th>
                  <th scope="col" className="py-2.5 pl-2 pr-2 font-bold">Issue</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Priority</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{view === "open" ? "Response" : "Resolved"}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-bold">
                    <span className="sr-only">Me too reports</span>
                    <Users aria-hidden className="ml-auto size-4" />
                  </th>
                  <th scope="col" className="py-2.5 pl-3 pr-4 font-bold">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => {
                  const late = isOverdue(t, now);
                  return (
                    <tr key={t.id} className={`transition-colors ${late ? "bg-emergency-bg/50 shadow-[inset_3px_0_0_var(--sev-emergency)]" : "hover:bg-surface-2"}`}>
                      <td className="num whitespace-nowrap py-3.5 pl-3 pr-2 align-top text-[1.125rem] text-navy">{formatTicketNumber(t.number)}</td>
                      <td className="py-3.5 pl-2 pr-2 align-top">
                        <Link href={`/tickets/${t.id}`} className="font-bold leading-snug text-ink hover:underline hover:decoration-2 hover:underline-offset-4">
                          {t.summary}
                        </Link>
                        <p className="mt-0.5 text-[0.875rem] text-ink-3">{placeText(t.building.name, t.space?.label, null)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 align-top">
                        <SeverityText severity={t.severity} />
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <StatusPill status={t.status} size="sm" />
                        {t.escalatedAt && late && <p className="mt-1 text-xs font-bold text-emergency">Escalated</p>}
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        {view === "open" ? (
                          t.firstResponseAt ? (
                            <span className="text-[0.875rem] text-ink-3">Responded</span>
                          ) : (
                            <Countdown compact dueAt={t.responseDueAt.toISOString()} serverNow={now.toISOString()} respondedAt={null} closed={false} escalated={!!t.escalatedAt} />
                          )
                        ) : (
                          <span className="num text-[0.9375rem] text-ink-3">{t.resolvedAt ? t.resolvedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "—"}</span>
                        )}
                      </td>
                      <td className="num px-3 py-3.5 text-right align-top text-[1.125rem] text-ink-2">{t.meTooCount || ""}</td>
                      <td className="py-3.5 pl-3 pr-3 align-top">
                        {t.assignee ? (
                          <span className="flex items-center gap-2 whitespace-nowrap text-[0.875rem] text-ink-2">
                            <Avatar name={t.assignee.name} hue={hueFor(t.assignee.id)} size="xs" />
                            {shortName(t.assignee.name)}
                          </span>
                        ) : view === "open" && canAct ? (
                          <QuickAssign ticketId={t.id} label={formatTicketNumber(t.number)} />
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Phones */}
          <div className="mt-3 md:hidden">
            <TicketList tickets={rows} now={now} showDue bare />
          </div>
        </>
      )}
    </div>
  );
}
