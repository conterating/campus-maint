import type { Metadata } from "next";
import Link from "next/link";
import { cleanWhere } from "@/components/WorkOrder";
import { redirect } from "next/navigation";
import { Repeat } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, homeFor } from "@/lib/session";
import { can } from "@/lib/visibility";
import { AdminNav } from "./AdminNav";
import { money } from "@/app/tickets/[id]/WorkLogList";
import {
  contractorStats,
  costByDepartment,
  avgResolutionHours,
  formatHours,
  headline,
  issuesByBuilding,
  recurringProblems,
  responseTargetShare,
  type AnalyticsTicket,
} from "@/lib/analytics";
import { CATEGORY_LABEL, DEPARTMENT_LABEL, type Category, type Department } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { BarChart, CHART_BAR } from "@/components/BarChart";

export const metadata: Metadata = { title: "Insights" };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default async function AdminPage() {
  const { viewer, now } = await getContext();
  if (!can(viewer, "canViewAnalytics")) redirect(homeFor(viewer.role));
  const showCosts = viewer.role === "ADMIN";

  const rows = await prisma.ticket.findMany({ include: { building: true, space: true, asset: true } });
  const tickets: AnalyticsTicket[] = rows.map((t) => ({
    id: t.id,
    number: t.number,
    summary: t.summary,
    category: t.category,
    department: t.department,
    status: t.status,
    buildingId: t.buildingId,
    buildingName: t.building.name,
    spaceId: t.spaceId,
    spaceLabel: t.space?.label ?? null,
    assetId: t.assetId,
    assetName: t.asset?.name ?? null,
    createdAt: t.createdAt,
    responseDueAt: t.responseDueAt,
    firstResponseAt: t.firstResponseAt,
    resolvedAt: t.resolvedAt,
    escalatedAt: t.escalatedAt,
    meTooCount: t.meTooCount,
  }));

  const head = headline(tickets, now);
  const byBuilding = issuesByBuilding(tickets);
  const recurring = recurringProblems(tickets, now);
  const resolution = avgResolutionHours(tickets);
  const sla = responseTargetShare(tickets, now);
  const logs = await prisma.workLog.findMany({ include: { contractor: { select: { name: true } }, ticket: { select: { department: true } } } });
  const logRows = logs.map((l) => ({ ticketId: l.ticketId, contractorId: l.contractorId, contractorName: l.contractor.name, department: l.ticket.department, endedAt: l.endedAt, minutes: l.minutes, materialsCost: l.materialsCost, laborCost: l.laborCost }));
  const perContractor = contractorStats(logRows);
  const deptCost = costByDepartment(logRows);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-12">
      <p className="wo-label">Campus Services, all departments</p>
      <h1 className="h-page mt-2">Insights</h1>
      <AdminNav viewer={viewer} current="insights" />

      <section aria-labelledby="sla-title" className="mt-10 grid grid-cols-1 gap-x-14 gap-y-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 id="sla-title" className="wo-label">
            First response on time
          </h2>
          <p className="mt-1 font-display text-[6.5rem] font-extrabold leading-[0.82] text-navy md:text-[8rem]">{pct(sla.overall.share)}</p>
          {sla.overall.total > 0 && (
            <div aria-hidden className="mt-4 flex h-3 gap-[3px]">
              <span className="wo-bar origin-left" style={{ width: `${(sla.overall.met / sla.overall.total) * 100}%`, background: CHART_BAR }} />
              <span className="flex-1 bg-panel" />
            </div>
          )}
          <p className="mt-3 text-ink-2">
            <span className="num text-[1.1875rem] text-ink">{sla.overall.met}</span> of <span className="num text-[1.1875rem]">{sla.overall.total}</span> tickets got a first response within target;{" "}
            <span className="num text-[1.1875rem] text-ink">{sla.overall.missed}</span> missed it.
          </p>
          <p className="mt-1 text-[0.875rem] text-ink-3">Tickets still inside their response window aren&apos;t counted yet.</p>
        </div>
        <dl className="grid grid-cols-2 self-start border-y-2 border-navy sm:grid-cols-3">
          {[
            { label: "Tickets", value: String(head.total) },
            { label: "Open now", value: String(head.open) },
            { label: "Overdue now", value: String(head.overdue), alert: head.overdue > 0 },
            { label: "Escalated (all time)", value: String(head.escalated) },
            { label: "Median first response", value: formatHours(head.medianFirstResponseHours) },
            { label: "“Me too” reports", value: String(head.meToos) },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`border-line px-4 py-4 ${i % 2 ? "border-l" : "border-l-0"} ${i % 3 ? "sm:border-l" : "sm:border-l-0"} ${i >= 2 ? "border-t" : ""} ${i >= 3 ? "sm:border-t" : "sm:border-t-0"}`}
            >
              <dt className="wo-label">{s.label}</dt>
              <dd className={`mt-1 font-display text-[2.5rem] font-extrabold leading-[0.9] ${s.alert ? "text-emergency" : "text-navy"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-16 grid grid-cols-1 gap-x-14 gap-y-14 lg:grid-cols-2">
        <BarChart
          title="Response target met, by department"
          description="Share of tickets with a first response inside the target for their severity."
          unit="On time"
          max={1}
          rows={sla.byDepartment.map((d) => ({
            key: d.department,
            label: DEPARTMENT_LABEL[d.department],
            value: d.share,
            valueLabel: pct(d.share),
            detail: d.total ? `${d.met} on time, ${d.missed} late` : "No tickets judged yet",
          }))}
        />
        <BarChart
          title="Average time to resolve"
          description="From report to staff marking it resolved, for resolved tickets."
          unit="Average"
          rows={resolution
            .slice()
            .sort((a, b) => (b.avgHours ?? -1) - (a.avgHours ?? -1))
            .map((d) => ({
              key: d.department,
              label: DEPARTMENT_LABEL[d.department],
              value: d.avgHours,
              valueLabel: formatHours(d.avgHours),
              detail: d.resolved ? `Across ${d.resolved} resolved ticket${d.resolved === 1 ? "" : "s"}` : "Nothing resolved yet",
            }))}
        />
      </div>

      <div className="mt-16 grid grid-cols-1 gap-x-14 gap-y-14 lg:grid-cols-[1.2fr_1fr]">
        <BarChart
          title="Issues by building"
          description="All tickets on record. The ten busiest buildings."
          unit="Tickets"
          limit={10}
          rows={byBuilding.map((b) => ({
            key: b.buildingId,
            label: b.name,
            value: b.total,
            valueLabel: String(b.total),
            detail: `${b.open} open, ${b.total - b.open} resolved`,
          }))}
        />

        <section aria-labelledby="recurring-title">
          <div className="rule-head">
            <h2 id="recurring-title" className="flex items-center gap-2 h-section">
              <Repeat aria-hidden className="size-5" /> Recurring problems
            </h2>
          </div>
          <p className="mt-2 text-[0.9375rem] text-ink-3">The same equipment, or the same problem in the same room, reported <span className="num">3+</span> times in <span className="num">90</span> days. Candidates for replacement rather than repair.</p>
          {recurring.length ? (
            <table className="mt-4 w-full text-left text-[0.9375rem]">
              <caption className="sr-only">Recurring problems in the last 90 days</caption>
              <thead className="wo-label">
                <tr>
                  <th scope="col" className="pb-2 font-bold">Where</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Reports</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recurring.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="py-3 pr-2 font-normal">
                      <Link href={`/tickets/${r.ticketIds[0]}`} className="font-bold text-ink hover:underline">
                        {r.label}
                      </Link>
                      <span className="block text-ink-3">{cleanWhere(r.where)}</span>
                      <span className="block text-[0.875rem] text-ink-3">
                        {CATEGORY_LABEL[r.category as Category]}, last reported <span className="num">{relativeTime(r.lastReported, now)}</span>
                      </span>
                    </th>
                    <td className="py-3 text-right align-top font-display text-[1.75rem] font-extrabold leading-none text-navy">{r.count}</td>
                    <td className="num py-3 pl-4 text-right align-top text-[1.25rem] text-ink-2">{r.openNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-ink-3">No repeat offenders in the last 90 days.</p>
          )}
        </section>
      </div>
      <section aria-labelledby="contractors-title" className="card mt-5 p-4 md:p-5">
        <h2 id="contractors-title" className="h-section">
          Contractor work
        </h2>
        <p className="mt-0.5 text-sm text-ink-3">From contractors&apos; work logs: finished jobs and average time on the job{showCosts ? ", with materials and labor cost" : ""}.</p>
        {perContractor.length ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Jobs completed by contractor</caption>
              <thead className="text-xs text-ink-3">
                <tr>
                  <th scope="col" className="pb-2 font-bold">Contractor</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Jobs done</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Avg time</th>
                  {showCosts && <th scope="col" className="pb-2 pl-4 text-right font-bold">Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {perContractor.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className="py-2.5 pr-2 font-bold text-ink">{c.name}</th>
                    <td className="num py-2.5 pl-4 text-right">{c.jobsCompleted}</td>
                    <td className="num py-2.5 pl-4 text-right">{c.avgMinutes == null ? "—" : formatHours(c.avgMinutes / 60)}</td>
                    {showCosts && <td className="num py-2.5 pl-4 text-right">{money(c.totalCost)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {showCosts && (
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left text-xs font-bold text-ink-3">Total cost by department</caption>
                <thead className="text-xs text-ink-3">
                  <tr>
                    <th scope="col" className="pb-2 font-bold">Department</th>
                    <th scope="col" className="pb-2 pl-4 text-right font-bold">Materials</th>
                    <th scope="col" className="pb-2 pl-4 text-right font-bold">Labor</th>
                    <th scope="col" className="pb-2 pl-4 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deptCost.map((d) => (
                    <tr key={d.department}>
                      <th scope="row" className="py-2.5 pr-2 font-bold text-ink">{DEPARTMENT_LABEL[d.department as Department]}</th>
                      <td className="num py-2.5 pl-4 text-right">{money(d.materials)}</td>
                      <td className="num py-2.5 pl-4 text-right">{money(d.labor)}</td>
                      <td className="num py-2.5 pl-4 text-right font-bold">{money(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p className="mt-4 text-ink-3">No finished work logged yet.</p>
        )}
      </section>
    </div>
  );
}
