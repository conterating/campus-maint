import { BellRing, Camera, Route, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { CLOSED_STATUSES, OPEN_STATUSES } from "@/lib/domain";

// Pieces of the public introduction, shared by the guest home page and the
// sign-in page. Only campus-wide public numbers: no dorm or room tickets.

export async function CampusStats({ now }: { now: Date }) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [openPublic, fixedThisWeek, buildings] = await Promise.all([
    prisma.ticket.count({ where: { scope: "PUBLIC", status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { status: { in: CLOSED_STATUSES }, resolvedAt: { gte: weekAgo } } }),
    prisma.building.count(),
  ]);
  return (
    <dl className="mt-8 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-line bg-line shadow-[var(--shadow-xs)]">
      {[
        { label: "Open public issues", value: openPublic },
        { label: "Fixed this week", value: fixedThisWeek },
        { label: "Buildings covered", value: buildings },
      ].map((s) => (
        <div key={s.label} className="bg-surface px-4 py-4">
          <dt className="text-[0.8125rem] text-ink-3">{s.label}</dt>
          <dd className="num mt-1 text-[1.75rem] font-bold leading-none text-ink">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const STEPS = [
  { Icon: Camera, title: "Report", text: "Describe the problem, add a photo, or scan the sticker on a machine or door." },
  { Icon: Route, title: "Routed instantly", text: "It's classified and sent to Housing, Facilities, IT, Dining, the Library, or Campus Rec, with a response target." },
  { Icon: Users, title: "Say “me too”", text: "Already reported? Add yourself instead of filing a duplicate. Enough reports raise the priority." },
  { Icon: BellRing, title: "Follow it to fixed", text: "Get an alert at every change, then confirm the fix or reopen it." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="mt-16 scroll-mt-24 border-t border-line pt-10">
      <h2 id="how-title" className="h-section text-xl">
        How it works
      </h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="card p-5">
            <span className="grid size-10 place-items-center rounded-[6px] bg-navy-50 text-navy">
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-3 font-bold text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {title}
            </h3>
            <p className="mt-1 text-sm text-ink-2">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
