import { redirect } from "next/navigation";
import { MapPinned, ShieldCheck } from "lucide-react";
import { CampusStats } from "@/components/Landing";
import { now } from "@/lib/clock";
import { getSessionState, homeFor } from "@/lib/session";
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

  const current = await now();
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

          <CampusStats now={current} />

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

    </div>
  );
}
