import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { listMyTicketsTab, type MyTicketsTab } from "@/lib/tickets";
import { isOpenStatus } from "@/lib/domain";
import { compareQueue } from "@/lib/sla";
import { TicketList } from "@/components/TicketTag";

export const metadata: Metadata = { title: "My tickets" };

const TABS: { key: MyTicketsTab; label: string; empty: string }[] = [
  { key: "reported", label: "Reported", empty: "You haven't reported anything yet." },
  { key: "room", label: "In my room", empty: "Nothing reported in your room." },
  { key: "following", label: "Following", empty: "You aren't following any issues." },
  { key: "metoo", label: "Me too", empty: "You haven't said “me too” on any issues." },
];

export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { viewer, now } = await getContext();
  requirePageRole(viewer, "STUDENT");
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  const counts = await Promise.all(TABS.map((t) => listMyTicketsTab(prisma, viewer, t.key).then((l) => l.length)));
  const tickets = await listMyTicketsTab(prisma, viewer, active.key);
  const sorted = [...tickets].sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || compareQueue(a, b, now));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">My tickets</h1>
          <p className="mt-1 text-ink-2">What you reported, what&apos;s happening in your room, and what you follow.</p>
        </div>
        <Link href="/report" className="btn btn-primary btn-sm">
          <Plus aria-hidden className="size-4" /> Report a problem
        </Link>
      </div>

      <nav aria-label="My tickets" className="mt-6 overflow-x-auto">
        <div className="seg w-full sm:w-auto">
          {TABS.map((t, i) => (
            <Link key={t.key} href={`/my-tickets?tab=${t.key}`} aria-current={active.key === t.key ? "page" : undefined}>
              {t.label} <span className="num text-ink-3">{counts[i]}</span>
            </Link>
          ))}
        </div>
      </nav>
      {active.key === "room" && !viewer.roomId && (
        <p className="mt-4 text-sm text-ink-2">{viewer.residenceVerified === false ? "Housing hasn't confirmed your room yet." : "You don't have a room on file."}</p>
      )}

      <p className="mb-2.5 mt-5 text-sm text-ink-3" aria-live="polite">
        {sorted.length} {sorted.length === 1 ? "ticket" : "tickets"}
      </p>
      {sorted.length ? (
        <TicketList tickets={sorted} now={now} headingLevel={2} showDue />
      ) : (
        <div className="card px-6 py-12 text-center">
          <p className="font-bold">{active.empty}</p>
          <Link href="/tickets?view=open" className="btn btn-secondary mt-5">
            See open issues on campus
          </Link>
        </div>
      )}
    </div>
  );
}
