import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/session";
import { ChangePasswordForm, TwoFactorPanel } from "./SecurityForms";

export const metadata: Metadata = { title: "Password & security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const actor = await getActor();
  const { enroll } = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { role: true, twoFactorEnabled: true, username: true } });
  const required = user.role === "ADMIN";
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Password &amp; security</h1>
      {required && !user.twoFactorEnabled && (
        <div role="alert" className="mt-4 rounded-[12px] bg-buzz-50 p-4 ring-1 ring-inset ring-buzz/50">
          <p className="font-bold text-ink">Set up two-factor sign-in to continue.</p>
          <p className="mt-1 text-sm text-ink-2">Administrator accounts must use an authenticator app. {enroll ? "You'll be able to use the rest of Ramblin' Repairs once it's on." : ""}</p>
        </div>
      )}

      <section aria-labelledby="tfa" className="card mt-6 p-5 md:p-6">
        <h2 id="tfa" className="h-section text-lg">
          Two-factor sign-in
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {required ? "Required for administrators." : "Optional for your account."} After your password, you&apos;ll enter a 6-digit code from an authenticator app such as
          Microsoft Authenticator, Google Authenticator, or 1Password.
        </p>
        <TwoFactorPanel enabled={!!user.twoFactorEnabled} required={required} />
      </section>

      <section aria-labelledby="pw" className="card mt-6 p-5 md:p-6">
        <h2 id="pw" className="h-section text-lg">
          Change password
        </h2>
        <p className="mt-1 text-sm text-ink-2">Changing your password signs you out on every other device.</p>
        <ChangePasswordForm username={user.username ?? ""} />
      </section>
    </div>
  );
}
