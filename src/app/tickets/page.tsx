import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContextOrGuest, requirePageRole } from "@/lib/session";
import { listMyTickets, listVisibleTickets } from "@/lib/tickets";
import { isStaff } from "@/lib/visibility";
import { CLOSED_STATUSES, OPEN_STATUSES, isOpenStatus } from "@/lib/domain";
import { compareQueue } from "@/lib/sla";
import { TicketList } from "@/components/TicketTag";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Reports" };

type Search = Promise<{ view?: string }>;

const TABS = [
  { key: "mine", label: "Mine" },
  { key: "open", label: "Open on campus" },
  { key: "closed", label: "Fixed" },
] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Search }) {
  const { viewer, now, guest } = await getContextOrGuest();
  requirePageRole(viewer, "STUDENT", "STAFF", "ADMIN");
  const { view = isStaff(viewer) || guest ? "open" : "mine" } = await searchParams;
  const tabs = guest ? TABS.filter((t) => t.key !== "mine") : TABS;
  const active = tabs.find((t) => t.key === view)?.key ?? tabs[0].key;

  const tickets =
    active === "mine"
      ? await listMyTickets(prisma, viewer)
      : await listVisibleTickets(prisma, viewer, { status: { in: active === "open" ? OPEN_STATUSES : CLOSED_STATUSES } });
  const sorted = active === "closed" ? tickets : [...tickets].sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || compareQueue(a, b, now));

  const staffView = isStaff(viewer);
  // "Mine" reads better split into what's still moving and what's done.
  const groups =
    active === "mine"
      ? [
          { key: "open", title: "Still open", items: sorted.filter((t) => isOpenStatus(t.status)) },
          { key: "done", title: "Fixed", items: sorted.filter((t) => !isOpenStatus(t.status)) },
        ].filter((g) => g.items.length)
      : [{ key: active, title: null as string | null, items: sorted }];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 md:px-6 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">{staffView ? "All issues" : guest ? "Issues on campus" : "My reports"}</h1>
          <p className="mt-2 text-[1.0625rem] text-ink-2">
            {active === "mine"
              ? "What you reported, live in, or follow."
              : staffView
                ? "Across every department."
                : guest
                  ? "Public issues in classrooms, libraries, dining and recreation. Sign in to see your own hall."
                  : "Everything you're able to see on campus."}
          </p>
        </div>
        <Link href={guest ? "/login?next=%2Freport" : "/report"} className="btn btn-primary">
          <Plus aria-hidden className="size-4" /> {guest ? "Sign in to report" : "Report a problem"}
        </Link>
      </div>

      <nav aria-label="Filter issues" className="mt-8">
        <div className="seg flex w-full">
          {tabs.map((t) => (
            <Link key={t.key} href={`/tickets?view=${t.key}`} aria-current={active === t.key ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <p className="sr-only" aria-live="polite">
        {sorted.length} {sorted.length === 1 ? "issue" : "issues"}
        {active === "open" && !staffView ? " you can see" : ""}
      </p>
      {sorted.length ? (
        <div className="mt-8 space-y-12">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title ?? undefined}>
              <div className="rule-head">
                <h2 className="h-section">{g.title ?? (active === "open" ? "Open now" : "Fixed")}</h2>
                <span className="num text-[1.25rem] text-ink-3">
                  {g.items.length}
                  <span className="sr-only"> {g.items.length === 1 ? "issue" : "issues"}</span>
                </span>
              </div>
              <TicketList tickets={g.items} now={now} headingLevel={2} showDue={staffView} bare />
            </section>
          ))}
        </div>
      ) : active === "mine" ? (
        <EmptyState art="tag" title="No work orders yet" action={<Link href="/report" className="btn btn-accent">Report a problem</Link>}>
          If something breaks between here and the Campanile, report it and you can track every step here.
        </EmptyState>
      ) : active === "open" ? (
        <EmptyState art="pin" title="Nothing open">
          Every report on campus is handled. Enjoy it while it lasts.
        </EmptyState>
      ) : (
        <EmptyState art="toolbox" title="Nothing fixed yet">
          Fixes show up here once a crew closes them out.
        </EmptyState>
      )}
    </div>
  );
}
