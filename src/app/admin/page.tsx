import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Repeat } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import {
  avgResolutionHours,
  formatHours,
  headline,
  issuesByBuilding,
  recurringProblems,
  responseTargetShare,
  type AnalyticsTicket,
} from "@/lib/analytics";
import { CATEGORY_LABEL, DEPARTMENT_LABEL, type Category } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { BarChart, CHART_BAR } from "@/components/BarChart";

export const metadata: Metadata = { title: "Insights" };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default async function AdminPage() {
  const { viewer, now } = await getContext();
  if (viewer.role !== "ADMIN") redirect(viewer.role === "STAFF" ? "/staff" : "/");

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

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Insights</h1>
      <p className="mt-1 text-sm text-ink-3">Campus Services · all departments</p>

      <section aria-labelledby="sla-title" className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_2fr]">
        <div className="card p-5">
          <h2 id="sla-title" className="text-sm font-bold text-ink-2">
            First response on time
          </h2>
          <p className="mt-2 font-display text-[3.25rem] font-bold leading-none tracking-[-0.03em] text-ink">{pct(sla.overall.share)}</p>
          {sla.overall.total > 0 && (
            <div aria-hidden className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full">
              <span className="rounded-l-full" style={{ width: `${(sla.overall.met / sla.overall.total) * 100}%`, background: CHART_BAR }} />
              <span className="flex-1 rounded-r-full bg-[#eef1f5]" />
            </div>
          )}
          <p className="mt-3 text-sm text-ink-2">
            <span className="font-bold text-ink">{sla.overall.met}</span> of {sla.overall.total} tickets got a first response within target;{" "}
            <span className="font-bold text-ink">{sla.overall.missed}</span> missed it.
          </p>
          <p className="mt-1 text-xs text-ink-3">Tickets still inside their response window aren&apos;t counted yet.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-[var(--shadow-xs)] sm:grid-cols-3">
          {[
            { label: "Tickets", value: String(head.total) },
            { label: "Open now", value: String(head.open) },
            { label: "Overdue now", value: String(head.overdue), alert: head.overdue > 0 },
            { label: "Escalated (all time)", value: String(head.escalated) },
            { label: "Median first response", value: formatHours(head.medianFirstResponseHours) },
            { label: "“Me too” reports", value: String(head.meToos) },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-4 py-4">
              <dt className="text-[0.8125rem] text-ink-3">{s.label}</dt>
              <dd className={`mt-1 font-display text-[1.75rem] font-bold leading-none tracking-[-0.02em] ${s.alert ? "text-emergency" : "text-ink"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <BarChart
          title="Issues by building"
          description="All tickets on record, busiest buildings first."
          unit="Tickets"
          rows={byBuilding.map((b) => ({
            key: b.buildingId,
            label: b.name,
            value: b.total,
            valueLabel: String(b.total),
            detail: `${b.open} open, ${b.total - b.open} resolved`,
          }))}
        />

        <section aria-labelledby="recurring-title" className="card p-4 md:p-5">
          <h2 id="recurring-title" className="flex items-center gap-2 h-section">
            <Repeat aria-hidden className="size-5" style={{ color: CHART_BAR }} /> Recurring problems
          </h2>
          <p className="mt-0.5 text-sm text-ink-3">The same equipment, or the same problem in the same room, reported 3+ times in 90 days. Candidates for replacement rather than repair.</p>
          {recurring.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Recurring problems in the last 90 days</caption>
              <thead className="text-xs text-ink-3">
                <tr>
                  <th scope="col" className="pb-2 font-bold">Where</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Reports</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-bold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recurring.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="py-2.5 pr-2 font-normal">
                      <Link href={`/tickets/${r.ticketIds[0]}`} className="font-bold text-ink hover:underline">
                        {r.label}
                      </Link>
                      <span className="block text-ink-3">
                        {r.where} · {CATEGORY_LABEL[r.category as Category]} · last {relativeTime(r.lastReported, now)}
                      </span>
                    </th>
                    <td className="num py-2.5 text-right text-base font-bold text-ink">{r.count}</td>
                    <td className="num py-2.5 pl-4 text-right text-ink-2">{r.openNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-ink-3">No repeat offenders in the last 90 days.</p>
          )}
        </section>
      </div>
    </div>
  );
}
