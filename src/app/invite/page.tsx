import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { inviteTokenUser } from "@/lib/accounts";
import { SetPasswordForm } from "@/components/SetPasswordForm";
import { ROLE_LABEL, isRole } from "@/lib/domain";

export const metadata: Metadata = { title: "Set up your account" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const user = token ? await inviteTokenUser(prisma, token) : null;
  return (
    <div className="mx-auto max-w-md px-4 pt-8 md:pt-14">
      <h1 className="h-page">Set up your account</h1>
      {user && token ? (
        <>
          <p className="mt-1.5 text-ink-2">
            Welcome, {user.firstName || user.name}. You&apos;ll sign in as <span className="font-bold text-ink">{user.username}</span> ({isRole(user.role) ? ROLE_LABEL[user.role] : "User"}).
          </p>
          <SetPasswordForm token={token} mode="invite" username={user.username ?? undefined} />
        </>
      ) : (
        <div className="card mt-6 p-5">
          <p className="text-ink-2">This invite link is invalid, already used, or has expired. Invites expire after 72 hours. Ask an administrator to send a new one.</p>
        </div>
      )}
    </div>
  );
}
