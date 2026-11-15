import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { isAdvisoryActive, listActiveAdvisories, listUpcomingAdvisories, listRecentlyEndedAdvisories } from "@/lib/advisories";
import { AdvisoryCard } from "@/components/AdvisoryBoard";
import { AdvisoryForm, ClearAdvisoryButton } from "./AdvisoryForms";
import { AdminNav } from "../AdminNav";

export const metadata: Metadata = { title: "Advisories" };

export default async function AdminAdvisoriesPage() {
  const { viewer, now } = await getContext();
  requirePageRole(viewer, "STAFF", "ADMIN");
  const [buildings, active, upcoming, ended] = await Promise.all([
    prisma.building.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listActiveAdvisories(prisma, now),
    listUpcomingAdvisories(prisma, now),
    listRecentlyEndedAdvisories(prisma, now),
  ]);
  const canClear = (createdById: string) => viewer.role === "ADMIN" || createdById === viewer.id;
  const live = [...active, ...upcoming];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-6 md:px-6 md:pt-10">
      <h1 className="h-page">Advisories</h1>
      <AdminNav viewer={viewer} current="advisories" />
      <p className="mt-1 text-ink-2">Tell everyone to avoid an area. It shows on the home page and sends an alert to every active account.</p>

      <section aria-labelledby="post-title" className="mt-8">
        <div className="rule-head">
          <h2 id="post-title" className="h-section">Post an advisory</h2>
        </div>
        <AdvisoryForm buildings={buildings} />
      </section>

      <section aria-labelledby="live-title" className="mt-12">
        <div className="rule-head">
          <h2 id="live-title" className="h-section">Active and scheduled</h2>
        </div>
        {live.length ? (
          <ul className="mt-4 space-y-4">
            {live.map((a) => (
              <li key={a.id}>
                <AdvisoryCard advisory={a} now={now} headingLevel={3} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.875rem] text-ink-3">
                  <span>{isAdvisoryActive(a, now) ? "Showing now" : "Scheduled, not showing yet"}</span>
                  {canClear(a.createdById) && <ClearAdvisoryButton id={a.id} title={a.title} />}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-3">No active advisories.</p>
        )}
      </section>

      {ended.length > 0 && (
        <section aria-labelledby="ended-title" className="mt-12">
          <div className="rule-head">
            <h2 id="ended-title" className="h-section">Recently ended</h2>
          </div>
          <div className="mt-4 space-y-3">
            {ended.map((a) => (
              <AdvisoryCard key={a.id} advisory={a} now={now} ended />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
