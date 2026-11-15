import Link from "next/link";
import { ArrowRight, LogIn, Map, UserPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { listVisibleTickets } from "@/lib/tickets";
import { compareQueue } from "@/lib/sla";
import { OPEN_STATUSES } from "@/lib/domain";
import type { Viewer } from "@/lib/visibility";
import { TicketList } from "@/components/TicketTag";
import { CampusStats, HowItWorks } from "@/components/Landing";

/** The home page for visitors who aren't signed in: what this is, public issues, and how to sign in. */
export async function GuestHome({ viewer, now }: { viewer: Viewer; now: Date }) {
  const open = await listVisibleTickets(prisma, viewer, { status: { in: OPEN_STATUSES } });
  const busiest = [...open].sort((a, b) => b.meTooCount - a.meTooCount || compareQueue(a, b, now)).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 md:pt-14">
      <section aria-labelledby="hero-title">
        <p className="eyebrow">Georgia Tech campus maintenance</p>
        <h1 id="hero-title" className="h-hero mt-2 max-w-xl">
          Report it once. Watch it get fixed.
        </h1>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">
          Tell us what&apos;s broken in your room, your hall, or anywhere on campus. We route it to the right team in seconds and show you every step until it&apos;s fixed.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="btn btn-primary">
            <LogIn aria-hidden className="size-4" /> Sign in
          </Link>
          <Link href="/signup" className="btn btn-accent">
            <UserPlus aria-hidden className="size-4" /> Create a student account
          </Link>
          <Link href="/map" className="btn btn-secondary">
            <Map aria-hidden className="size-4" /> See the map
          </Link>
        </div>
        <CampusStats now={now} />
      </section>
      <section aria-labelledby="busiest-title" className="mt-16">
        <div className="rule-head">
          <h2 id="busiest-title" className="h-section text-[1.625rem]">
            Most reported right now
          </h2>
          <Link href="/tickets" className="link-action inline-flex items-center gap-1 text-[0.9375rem]">
            All issues <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
        <p className="mt-2 text-[0.9375rem] text-ink-3">Public spaces only. Sign in to see issues in your own hall.</p>
        <div className="mt-3">
          {busiest.length ? (
            <TicketList tickets={busiest} now={now} headingLevel={3} bare />
          ) : (
            <p className="card px-5 py-8 text-center text-ink-3">Nothing open in public spaces right now.</p>
          )}
        </div>
      </section>
      <HowItWorks />
    </div>
  );
}
