import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getContextOrGuest } from "@/lib/session";
import { listActiveAdvisories, listRecentlyEndedAdvisories } from "@/lib/advisories";
import { AdvisoryCard } from "@/components/AdvisoryBoard";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Campus advisories" };

export default async function AdvisoriesPage() {
  const { viewer, now } = await getContextOrGuest();
  const [active, ended] = await Promise.all([listActiveAdvisories(prisma, now), listRecentlyEndedAdvisories(prisma, now)]);
  const canPost = viewer.role === "STAFF" || viewer.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-8 md:px-6 md:pt-14">
      <h1 className="h-page">Campus advisories</h1>
      <p className="mt-2 text-[1.0625rem] text-ink-2">Areas to avoid and other campus-wide notices. If anyone is in danger, call Campus Police.</p>
      {canPost && (
        <p className="mt-3">
          <Link href="/admin/advisories" className="link-action text-[0.9375rem]">
            Post or clear an advisory
          </Link>
        </p>
      )}

      <section aria-labelledby="active-title" className="mt-10">
        <div className="rule-head">
          <h2 id="active-title" className="h-section">Active now</h2>
        </div>
        {active.length ? (
          <div className="mt-4 space-y-3">
            {active.map((a) => (
              <AdvisoryCard key={a.id} advisory={a} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState art="clipboard" title="Nothing to avoid">
            There are no active advisories. Campus is clear.
          </EmptyState>
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
