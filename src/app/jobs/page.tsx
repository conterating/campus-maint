import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { listContractorJobs } from "@/lib/tickets";
import { compareQueue } from "@/lib/sla";
import { isOpenStatus, type Availability } from "@/lib/domain";
import { credentialWarnings } from "@/lib/eligibility";
import { AdvisoryBoard } from "@/components/AdvisoryBoard";
import { listActiveAdvisories } from "@/lib/advisories";
import { TicketList } from "@/components/TicketTag";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { BreakManager, type BreakRow } from "./BreakManager";
import { ScheduleTimeline } from "@/components/ScheduleTimeline";
import { dayItems, expireBreakStatus, loadContractorDay } from "@/lib/scheduling/service";
import { campusDayAt, campusDayStart, formatClock, formatDay, minuteLabel } from "@/lib/scheduling/time";

export const metadata: Metadata = { title: "My jobs" };

export default async function JobsPage() {
  const { viewer, now } = await getContext();
  requirePageRole(viewer, "CONTRACTOR");
  await expireBreakStatus(prisma, viewer.id, now); // a finished break shouldn't leave "On a break" showing
  const [profile, jobs] = await Promise.all([prisma.contractorProfile.findUnique({ where: { userId: viewer.id } }), listContractorJobs(prisma, viewer)]);
  const open = jobs.filter((t) => isOpenStatus(t.status)).sort((a, b) => compareQueue(a, b, now));
  const done = jobs.filter((t) => !isOpenStatus(t.status)).slice(0, 10);
  const advisories = await listActiveAdvisories(prisma, now);
  const warnings = profile ? credentialWarnings(profile, now) : [];

  const today = campusDayStart(now.getTime());
  const day = await loadContractorDay(prisma, viewer.id, today, now);
  const items = dayItems(day);
  const nextUp = items.find((i) => i.kind === "JOB" && i.status !== "DONE" && i.end > now.getTime());
  const upcomingBreaks = await prisma.contractorBreak.findMany({ where: { contractorId: viewer.id, endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 20 });
  const breakRows: BreakRow[] = upcomingBreaks.map((b) => ({
    id: b.id,
    label: `${formatDay(b.startsAt)}, ${formatClock(b.startsAt)} to ${formatClock(b.endsAt)}`,
    reason: b.reason,
    future: b.startsAt.getTime() > now.getTime(),
  }));
  const dayOptions = Array.from({ length: 8 }, (_, i) => ({ offset: i, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(campusDayAt(now.getTime(), i)) }));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 md:pt-10">
      {advisories.length > 0 && <AdvisoryBoard advisories={advisories} now={now} className="mb-8" />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">My jobs</h1>
          <p className="mt-1 text-ink-2">{profile?.companyName ?? "Contractor"} · jobs assigned to you, most urgent first.</p>
        </div>
        {profile && <AvailabilityPicker value={profile.availability as Availability} />}
      </div>

      {warnings.length > 0 && (
        <div role="alert" className="mt-5 flex gap-3 rounded-[12px] bg-urgent-bg p-4 ring-1 ring-inset ring-urgent/30">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent" />
          <div>
            <p className="font-bold text-ink">Your credentials need attention</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
              {warnings.map((w) => (
                <li key={w}>{w}.</li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-ink-2">Send updated documents to the Campus Services contractor office, or you won&apos;t be assigned new jobs.</p>
          </div>
        </div>
      )}

      <section aria-labelledby="today-title" className="mt-8">
        <div className="rule-head">
          <h2 id="today-title" className="h-section text-lg">
            Today <span className="num text-ink-3">{formatDay(now)}</span>
          </h2>
          {profile && <span className="wo-label">Shift {minuteLabel(profile.shiftStartMinute)} to {minuteLabel(profile.shiftEndMinute)}</span>}
        </div>
        {nextUp && nextUp.kind === "JOB" && (
          <p className="mt-3 border-l-[3px] border-gold py-1 pl-3 text-[0.9375rem]">
            <span className="wo-label">Next up</span>
            <br />
            <span className="num text-navy">RR-{nextUp.number}</span> <span className="font-bold">{nextUp.summary}</span> at <span className="num">{formatClock(nextUp.start)}</span>
            {nextUp.travel > 0 && <span className="text-ink-3"> · {nextUp.travel} min travel first</span>}
          </p>
        )}
        <div className="mt-3">
          <ScheduleTimeline items={items} now={now.getTime()} />
        </div>
      </section>

      <section aria-labelledby="breaks-title" className="mt-8">
        <div className="rule-head">
          <h2 id="breaks-title" className="h-section text-lg">
            Breaks
          </h2>
        </div>
        <p className="mt-2 text-sm text-ink-2">New jobs are scheduled around your breaks. Adding one pushes later jobs back.</p>
        <div className="mt-4">
          <BreakManager breaks={breakRows} dayOptions={dayOptions} onBreak={profile?.availability === "ON_BREAK"} canTakeBreak={!!profile && profile.availability !== "OFF_DUTY"} />
        </div>
      </section>

      <section aria-labelledby="open-jobs" className="mt-8">
        <h2 id="open-jobs" className="h-section text-lg">
          Open jobs <span className="num text-ink-3">{open.length}</span>
        </h2>
        <div className="mt-3">
          {open.length ? (
            <TicketList tickets={open} now={now} headingLevel={3} showDue />
          ) : (
            <div className="card px-6 py-10 text-center">
              <p className="font-bold">No open jobs right now</p>
              <p className="mt-1 text-sm text-ink-3">New assignments show up here and in your alerts.</p>
            </div>
          )}
        </div>
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done-jobs" className="mt-8">
          <h2 id="done-jobs" className="h-section text-lg">
            Recently finished
          </h2>
          <div className="mt-3">
            <TicketList tickets={done} now={now} headingLevel={3} />
          </div>
        </section>
      )}
    </div>
  );
}
