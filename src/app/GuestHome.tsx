import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Map, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { listVisibleTickets } from "@/lib/tickets";
import { compareQueue } from "@/lib/sla";
import { OPEN_STATUSES } from "@/lib/domain";
import type { Viewer } from "@/lib/visibility";
import { TicketList } from "@/components/TicketTag";
import { CampusStats, HowItWorks } from "@/components/Landing";
import { AdvisoryBoard } from "@/components/AdvisoryBoard";
import { listActiveAdvisories } from "@/lib/advisories";

/** The home page for visitors who aren't signed in: what this is, public issues, and how to sign in. */
export async function GuestHome({ viewer, now }: { viewer: Viewer; now: Date }) {
  const [open, advisories] = await Promise.all([listVisibleTickets(prisma, viewer, { status: { in: OPEN_STATUSES } }), listActiveAdvisories(prisma, now)]);
  const busiest = [...open].sort((a, b) => b.meTooCount - a.meTooCount || compareQueue(a, b, now)).slice(0, 5);

  return (
    <div className="overflow-x-clip">
    <div className="mx-auto max-w-6xl px-4 pt-8 md:pt-14">
      <AdvisoryBoard advisories={advisories} now={now} className="mb-8" />
      <section aria-labelledby="hero-title" className="relative isolate pb-6 lg:pb-12">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[calc(50%-50vw)] -z-10 w-screen lg:w-[64vw]">
          <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_0%,transparent_55%)] lg:[mask-image:linear-gradient(to_left,black_30%,transparent_92%)]">
            <Image
              src="/brand/tech-tower.jpg"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 64vw, 100vw"
              className="object-cover object-[50%_28%] opacity-30 saturate-[.8] lg:opacity-70"
            />
            <div className="absolute inset-0 bg-navy/10 mix-blend-multiply" />
          </div>
          <div className="absolute inset-x-0 top-0 hidden h-1/4 bg-gradient-to-b from-bg to-transparent lg:block" />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-bg/70 to-transparent lg:block" />
          <span className="absolute bottom-3 right-[calc(50vw-50%+1rem)] hidden text-xs text-ink-3 lg:block">Tech Tower</span>
        </div>
        <div className="relative min-w-0 max-w-2xl lg:py-10">
        <p className="eyebrow">Georgia Tech campus maintenance</p>
        <h1 id="hero-title" className="h-hero mt-2 max-w-xl">
          Report it once. Watch it get fixed.
        </h1>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">
          Tell us what&apos;s broken in your room, your hall, or anywhere on campus. We route it to the right team in seconds and show you every step until it&apos;s fixed.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Not signed in? /report sends them through sign-in and straight back to the form. */}
          <Link href="/report" className="btn btn-accent">
            <Plus aria-hidden className="size-4" strokeWidth={2.75} /> File an issue
          </Link>
          <Link href="/map" className="btn btn-secondary">
            <Map aria-hidden className="size-4" /> See the map
          </Link>
        </div>
        <CampusStats now={now} />
        </div>
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
    </div>
  );
}
