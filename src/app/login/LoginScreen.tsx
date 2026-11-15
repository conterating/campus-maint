import { redirect } from "next/navigation";
import { getSessionState, homeFor } from "@/lib/session";
import type { LoginTab } from "@/lib/auth-schemas";
import { LoginForm } from "./LoginForm";

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

  return (
    <div className="mx-auto max-w-md px-4 pt-8 md:pt-14">
      <h1 className="h-page">Sign in</h1>
      <p className="mt-1.5 text-ink-2">Report and track campus maintenance issues.</p>
      <LoginForm tab={tab} next={searchParams.next} notice={notice} />
    </div>
  );
}
