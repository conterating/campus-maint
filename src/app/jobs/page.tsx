import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { listContractorJobs } from "@/lib/tickets";
import { compareQueue } from "@/lib/sla";
import { isOpenStatus, type Availability } from "@/lib/domain";
import { credentialWarnings } from "@/lib/eligibility";
import { TicketList } from "@/components/TicketTag";
import { AvailabilityPicker } from "./AvailabilityPicker";

export const metadata: Metadata = { title: "My jobs" };

export default async function JobsPage() {
  const { viewer, now } = await getContext();
  requirePageRole(viewer, "CONTRACTOR");
  const [profile, jobs] = await Promise.all([prisma.contractorProfile.findUnique({ where: { userId: viewer.id } }), listContractorJobs(prisma, viewer)]);
  const open = jobs.filter((t) => isOpenStatus(t.status)).sort((a, b) => compareQueue(a, b, now));
  const done = jobs.filter((t) => !isOpenStatus(t.status)).slice(0, 10);
  const warnings = profile ? credentialWarnings(profile, now) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 md:pt-10">
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

      <section aria-labelledby="open-jobs" className="mt-6">
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
