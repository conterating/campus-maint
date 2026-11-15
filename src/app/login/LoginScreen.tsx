import { redirect } from "next/navigation";
import { BellRing, Camera, MapPinned, Route, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { getSessionState, homeFor } from "@/lib/session";
import { CLOSED_STATUSES, OPEN_STATUSES } from "@/lib/domain";
import type { LoginTab } from "@/lib/auth-schemas";
import { LoginForm } from "./LoginForm";

const INTRO: Record<LoginTab, { eyebrow: string; title: string; text: string }> = {
  student: {
    eyebrow: "Georgia Tech campus maintenance",
    title: "Report it once. Watch it get fixed.",
    text: "Tell us what's broken in your room, your hall, or anywhere on campus. We route it to the right team in seconds and show you every step until it's fixed.",
  },
  contractor: {
    eyebrow: "For contractors",
    title: "Your jobs, in one list.",
    text: "See the work assigned to you, sorted by urgency, with the room details you need. Log your time and materials and mark jobs done from your phone.",
  },
  staff: {
    eyebrow: "For staff and administrators",
    title: "Every request, already routed.",
    text: "Your department's queue arrives classified and sorted by severity and time remaining. Dispatch to contractors, track response targets, and see campus-wide trends.",
  },
};

const STEPS = [
  { Icon: Camera, title: "Report", text: "Describe the problem, add a photo, or scan the sticker on a machine or door." },
  { Icon: Route, title: "Routed instantly", text: "It's classified and sent to Housing, Facilities, IT, Dining, the Library, or Campus Rec, with a response target." },
  { Icon: Users, title: "Say “me too”", text: "Already reported? Add yourself instead of filing a duplicate. Enough reports raise the priority." },
  { Icon: BellRing, title: "Follow it to fixed", text: "Get an alert at every change, then confirm the fix or reopen it." },
];

/** Shared by /login, /login/contractor and /login/staff. */
export async function LoginScreen({ tab, searchParams }: { tab: LoginTab; searchParams: Record<string, string | undefined> }) {
  const state = await getSessionState();
  if (state.status === "ok") redirect(state.needsTwoFactorEnrollment ? "/account/security?enroll=1" : homeFor(state.user.role as never));

  const notice = searchParams.verified
    ? "Your email is confirmed. Sign in to continue."
    : searchParams.reset
      ? "Your password was changed. Sign in with your new password."
      : searchParams.invited
        ? "Your password is set. Sign in to continue."
        : null;

  // Campus-wide public numbers only (no dorm or room tickets).
  const weekAgo = new Date((await now()).getTime() - 7 * 86_400_000);
  const [openPublic, fixedThisWeek, buildings] = await Promise.all([
    prisma.ticket.count({ where: { scope: "PUBLIC", status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { status: { in: CLOSED_STATUSES }, resolvedAt: { gte: weekAgo } } }),
    prisma.building.count(),
  ]);
  const intro = INTRO[tab];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 md:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-14">
        <section aria-labelledby="intro-title" className="lg:pt-6">
          <p className="eyebrow">{intro.eyebrow}</p>
          <h1 id="intro-title" className="h-hero mt-2 max-w-xl">
            {intro.title}
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">{intro.text}</p>

          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-[var(--shadow-xs)]">
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

          <ul className="mt-8 hidden max-w-xl space-y-3 text-ink-2 lg:block">
            <li className="flex items-start gap-3">
              <MapPinned aria-hidden className="mt-0.5 size-5 shrink-0 text-navy" />
              <span>Open issues on a campus map, so you can see what&apos;s already reported near you.</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-navy" />
              <span>Room issues stay private to your room and staff. Your GT ID is never shown to other students or contractors.</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="signin-title" className="lg:sticky lg:top-24">
          <h2 id="signin-title" className="h-section text-xl">
            Sign in
          </h2>
          <LoginForm tab={tab} next={searchParams.next} notice={notice} />
        </section>
      </div>

      <section id="how-it-works" aria-labelledby="how-title" className="mt-16 scroll-mt-24 border-t border-line pt-10">
        <h2 id="how-title" className="h-section text-xl">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className="card p-5">
              <span className="grid size-10 place-items-center rounded-[12px] bg-navy-50 text-navy">
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
    </div>
  );
}
