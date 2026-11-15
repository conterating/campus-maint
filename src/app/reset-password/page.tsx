import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SetPasswordForm } from "@/components/SetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token } = await searchParams;
  const row = token ? await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}` } }) : null;
  const valid = !!row && row.expiresAt > new Date();
  const user = valid ? await prisma.user.findUnique({ where: { id: row.value }, select: { username: true } }) : null;
  return (
    <div className="mx-auto max-w-md px-4 pt-8 md:pt-14">
      <h1 className="h-page">Choose a new password</h1>
      {valid && token ? (
        <SetPasswordForm token={token} mode="reset" username={user?.username ?? undefined} />
      ) : (
        <div className="card mt-6 p-5">
          <p className="text-ink-2">This reset link is invalid, already used, or has expired. Reset links work once and expire after 1 hour.</p>
          <Link href="/forgot-password" className="btn btn-primary mt-4">
            Request a new link
          </Link>
        </div>
      )}
    </div>
  );
}
