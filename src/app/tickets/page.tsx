import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { listMyTickets, listVisibleTickets } from "@/lib/tickets";
import { isStaff } from "@/lib/visibility";
import { CLOSED_STATUSES, OPEN_STATUSES, isOpenStatus } from "@/lib/domain";
import { compareQueue } from "@/lib/sla";
import { TicketList } from "@/components/TicketTag";

export const metadata: Metadata = { title: "Reports" };

type Search = Promise<{ view?: string }>;

const TABS = [
  { key: "mine", label: "Mine" },
  { key: "open", label: "Open on campus" },
  { key: "closed", label: "Fixed" },
] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Search }) {
  const { viewer, now } = await getContext();
  requirePageRole(viewer, "STUDENT", "STAFF", "ADMIN");
  const { view = isStaff(viewer) ? "open" : "mine" } = await searchParams;
  const active = TABS.find((t) => t.key === view)?.key ?? "mine";

  const tickets =
    active === "mine"
      ? await listMyTickets(prisma, viewer)
      : await listVisibleTickets(prisma, viewer, { status: { in: active === "open" ? OPEN_STATUSES : CLOSED_STATUSES } });
  const sorted = active === "closed" ? tickets : [...tickets].sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || compareQueue(a, b, now));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">{isStaff(viewer) ? "All issues" : "My reports"}</h1>
          <p className="mt-1 text-ink-2">
            {active === "mine" ? "What you reported, live in, or follow." : isStaff(viewer) ? "Across every department." : "Everything you're able to see on campus."}
          </p>
        </div>
        <Link href="/report" className="btn btn-primary btn-sm">
          <Plus aria-hidden className="size-4" /> Report a problem
        </Link>
      </div>

      <nav aria-label="Filter issues" className="mt-6">
        <div className="seg w-full sm:w-auto">
          {TABS.map((t) => (
            <Link key={t.key} href={`/tickets?view=${t.key}`} aria-current={active === t.key ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <p className="mb-2.5 mt-5 text-sm text-ink-3" aria-live="polite">
        {sorted.length} {sorted.length === 1 ? "issue" : "issues"}
        {active === "open" && !isStaff(viewer) ? " you can see" : ""}
      </p>
      {sorted.length ? (
        <TicketList tickets={sorted} now={now} headingLevel={2} showDue={isStaff(viewer)} />
      ) : (
        <div className="card px-6 py-12 text-center">
          <p className="font-bold">{active === "mine" ? "You haven't reported or followed anything yet" : "Nothing here right now"}</p>
          <p className="mt-1 text-sm text-ink-3">Report a problem and you can track it here.</p>
          <Link href="/report" className="btn btn-primary mt-5">
            Report a problem
          </Link>
        </div>
      )}
    </div>
  );
}
