import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Map, QrCode, ShieldAlert, Siren, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listDepartmentQueue, shortName } from "@/lib/tickets";
import { compareQueue, isOverdue } from "@/lib/sla";
import { DEPARTMENTS, DEPARTMENT_LABEL, formatTicketNumber, isDepartment, isOpenStatus, type Department } from "@/lib/domain";
import { CategoryIcon, SeverityText, StatusPill } from "@/components/badges";
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
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{viewer.role === "ADMIN" ? "All departments" : `${viewer.name}${viewer.isSupervisor ? " · Supervisor" : ""}`}</p>
          <h1 className="h-page mt-0.5">{DEPARTMENT_LABEL[dept]} queue</h1>
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
        <nav aria-label="Department" className="-mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex gap-1.5">
            {DEPARTMENTS.map((d) => (
              <li key={d}>
                <Link
                  href={deptLink(d)}
                  aria-current={d === dept ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-inset ${d === dept ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line-2 hover:text-ink"}`}
                >
                  {DEPARTMENT_LABEL[d]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line shadow-[var(--shadow-xs)] sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3.5">
            <dt className="text-[0.8125rem] text-ink-3">{s.label}</dt>
            <dd className={`mt-1 font-display text-[1.75rem] font-bold leading-none tracking-[-0.02em] ${s.alert ? "text-emergency" : "text-ink"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {escalatedToMe.length > 0 && (
        <section aria-labelledby="esc-title" className="mt-5 rounded-[10px] border border-emergency/30 bg-emergency-bg p-4">
          <h2 id="esc-title" className="flex items-center gap-2 font-bold text-emergency">
            <ShieldAlert aria-hidden className="size-5" /> Escalated to you
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">These missed their response target. Assign someone or post an update to stop the clock.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {escalatedToMe.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 rounded-[8px] bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-xs)] ring-1 ring-emergency/20 hover:ring-emergency/50">
                  <span className="num text-xs text-ink-3">{formatTicketNumber(t.number)}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{t.summary}</span>
                  <ArrowRight aria-hidden className="size-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {emergencies.length > 0 && view === "open" && (
        <section aria-labelledby="emerg-title" className="mt-5 overflow-hidden rounded-[10px] border border-emergency/40 bg-surface shadow-[var(--shadow-sm)]">
          <div aria-hidden className="hazard h-1.5" />
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Siren aria-hidden className="size-5 text-emergency" />
            <h2 id="emerg-title" className="font-bold text-emergency">
              Emergencies skip the queue
            </h2>
          </div>
          <TicketList tickets={emergencies} now={now} bare showDue />
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Queue view">
          <div className="seg">
            {(["open", "closed"] as const).map((v) => (
              <Link key={v} href={deptLink(dept, v)} aria-current={view === v ? "page" : undefined}>
                {v === "open" ? `Open (${queue.length})` : `Resolved (${closed.length})`}
              </Link>
            ))}
          </div>
        </nav>
        <p className="text-sm text-ink-3">{view === "open" ? "Sorted by severity, then time left to respond" : "Most recently resolved first"}</p>
      </div>

      {!rows.length ? (
        <p className="card mt-3 px-6 py-12 text-center text-ink-3">{view === "open" ? "Queue's clear." : "Nothing resolved yet."}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card mt-3 hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {DEPARTMENT_LABEL[dept]} {view === "open" ? "open tickets, sorted by severity then time remaining" : "resolved tickets"}
              </caption>
              <thead className="border-b border-line bg-surface-2 text-xs font-bold text-ink-3">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-2 font-bold">Issue</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Severity</th>
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
                    <tr key={t.id} className={`transition-colors ${late ? "bg-emergency-bg/60" : "hover:bg-surface-2"}`}>
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-3">
                          <CategoryIcon category={t.category} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/tickets/${t.id}`} className="font-bold text-ink hover:text-navy hover:underline">
                              {t.summary}
                            </Link>
                            <p className="mt-0.5 truncate text-[0.8125rem] text-ink-3">
                              <span className="num">{formatTicketNumber(t.number)}</span> · {[t.building.name, t.space?.label].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[0.8125rem]">
                        <SeverityText severity={t.severity} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={t.status} size="sm" />
                        {t.escalatedAt && late && <p className="mt-1 text-xs font-bold text-emergency">Escalated</p>}
                      </td>
                      <td className="px-3 py-3">
                        {view === "open" ? (
                          t.firstResponseAt ? (
                            <span className="text-[0.8125rem] text-ink-3">Responded</span>
                          ) : (
                            <Countdown compact dueAt={t.responseDueAt.toISOString()} serverNow={now.toISOString()} respondedAt={null} closed={false} escalated={!!t.escalatedAt} />
                          )
                        ) : (
                          <span className="text-[0.8125rem] text-ink-3">{t.resolvedAt ? t.resolvedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "—"}</span>
                        )}
                      </td>
                      <td className="num px-3 py-3 text-right font-bold text-ink-2">{t.meTooCount || ""}</td>
                      <td className="py-3 pl-3 pr-4">
                        {t.assignee ? (
                          <span className="flex items-center gap-2 whitespace-nowrap text-[0.8125rem] text-ink-2">
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
            <TicketList tickets={rows} now={now} showDue />
          </div>
        </>
      )}
    </div>
  );
}
