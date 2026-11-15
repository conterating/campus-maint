import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, homeFor } from "@/lib/session";
import { can } from "@/lib/visibility";
import {
  AVAILABILITY_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  DAY_NAME,
  DEPARTMENTS,
  DEPARTMENT_LABEL,
  OPEN_STATUSES,
  SKILLS,
  SKILL_LABEL,
  parseKeyList,
  parseWorkDays,
  type Availability,
} from "@/lib/domain";
import { credentialWarnings } from "@/lib/eligibility";
import { contractorSkillSet } from "@/lib/scheduling/skills";
import { dayItems, loadContractorDay } from "@/lib/scheduling/service";
import { campusDayAt, campusParts, formatDay, minuteLabel } from "@/lib/scheduling/time";
import { ScheduleTimeline } from "@/components/ScheduleTimeline";
import { AdminNav } from "../../AdminNav";

export const metadata: Metadata = { title: "Contractor schedule" };

export default async function ContractorDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string }> }) {
  const { id } = await params;
  const { day: dayParam } = await searchParams;
  const { viewer, now } = await getContext();
  if (!can(viewer, "canManageContractors")) redirect(homeFor(viewer.role));

  const user = await prisma.user.findFirst({ where: { id, role: "CONTRACTOR" }, include: { contractorProfile: true } });
  if (!user?.contractorProfile) notFound();
  const p = user.contractorProfile;

  const offset = Math.min(13, Math.max(0, Number.isInteger(Number(dayParam)) ? Number(dayParam) : 0));
  const dayStart = campusDayAt(now.getTime(), offset);
  const [items, open] = await Promise.all([
    loadContractorDay(prisma, user.id, dayStart, now).then(dayItems),
    prisma.ticket.count({ where: { assigneeId: user.id, status: { in: OPEN_STATUSES } } }),
  ]);
  const skills = contractorSkillSet(p, parseKeyList(p.trades, CATEGORIES));
  const warnings = credentialWarnings(p, now);
  const days = Array.from({ length: 7 }, (_, i) => ({ i, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(campusDayAt(now.getTime(), i)) }));
  const worksThatDay = parseWorkDays(p.workDays).includes(campusParts(dayStart + 12 * 3_600_000).dow);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:pt-10">
      <Link href="/admin/contractors" className="inline-flex items-center gap-1 text-sm font-bold text-navy hover:underline">
        <ChevronLeft aria-hidden className="size-4" /> All contractors
      </Link>
      <h1 className="h-page mt-2">{user.name}</h1>
      <p className="mt-1 text-ink-2">
        {p.companyName} · <span className="num">{p.contractorId}</span> · @{user.username}
      </p>
      <AdminNav viewer={viewer} current="contractors" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section aria-labelledby="profile-title">
          <div className="rule-head">
            <h2 id="profile-title" className="h-section text-lg">
              Profile
            </h2>
          </div>
          <dl className="mt-4 space-y-4 text-[0.9375rem]">
            <div>
              <dt className="wo-label">Status</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <span className="pill bg-navy-50 text-navy">{AVAILABILITY_LABEL[p.availability as Availability]}</span>
                <span className="pill bg-bg text-ink-2">
                  {open} open job{open === 1 ? "" : "s"} (max {p.maxActiveJobs})
                </span>
                {p.onCall && <span className="pill bg-bg text-ink-2">On call</span>}
              </dd>
            </div>
            <div>
              <dt className="wo-label">Shift</dt>
              <dd className="num mt-1 text-navy">
                {minuteLabel(p.shiftStartMinute)} to {minuteLabel(p.shiftEndMinute)}
              </dd>
              <dd className="text-ink-2">{parseWorkDays(p.workDays).map((d) => DAY_NAME[d]).join(", ") || "No work days"}</dd>
            </div>
            <div>
              <dt className="wo-label">Skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {skills.map((k) => (
                  <span key={k} className="pill bg-bg text-ink-2">
                    {SKILL_LABEL[k]}
                  </span>
                ))}
                {!parseKeyList(p.skills, SKILLS).length && <span className="text-ink-3">Derived from trades</span>}
              </dd>
            </div>
            <div>
              <dt className="wo-label">Trades</dt>
              <dd className="mt-1 text-ink-2">{parseKeyList(p.trades, CATEGORIES).map((c) => CATEGORY_LABEL[c]).join(", ")}</dd>
            </div>
            <div>
              <dt className="wo-label">Works for</dt>
              <dd className="mt-1 text-ink-2">{parseKeyList(p.departments, DEPARTMENTS).map((d) => DEPARTMENT_LABEL[d]).join(", ")}</dd>
            </div>
            {warnings.length > 0 && <p className="font-bold text-urgent">{warnings.join("; ")}</p>}
          </dl>
          <p className="mt-4 text-sm text-ink-3">Edit skills, shift and on-call on the contractors list.</p>
        </section>

        <section aria-labelledby="sched-title" className="min-w-0">
          <div className="rule-head">
            <h2 id="sched-title" className="h-section text-lg">
              Schedule <span className="num text-ink-3">{formatDay(dayStart + 12 * 3_600_000)}</span>
            </h2>
          </div>
          <nav aria-label="Day" className="-mx-4 mt-3 overflow-x-auto px-4">
            <div className="seg flex min-w-max">
              {days.map((d) => (
                <Link key={d.i} href={`/admin/contractors/${user.id}?day=${d.i}`} aria-current={d.i === offset ? "page" : undefined}>
                  {d.label}
                </Link>
              ))}
            </div>
          </nav>
          {!worksThatDay && <p className="mt-3 text-sm text-ink-3">Not a scheduled work day.</p>}
          <div className="mt-3">
            <ScheduleTimeline items={items} now={now.getTime()} detailed />
          </div>
        </section>
      </div>
    </div>
  );
}
