import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionState, homeFor } from "@/lib/session";
import { residenceOptions } from "@/lib/residences";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create a student account" };

export default async function SignupPage() {
  const state = await getSessionState();
  if (state.status === "ok") redirect(homeFor(state.user.role as never));
  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 md:pt-12">
      <h1 className="h-page">Create a student account</h1>
      <p className="mt-1.5 max-w-prose text-ink-2">
        For Georgia Tech students. Staff and contractor accounts are created by an administrator.
      </p>
      <SignupForm halls={await residenceOptions()} />
    </div>
  );
}
