import type { Metadata } from "next";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-8 md:pt-14">
      <h1 className="h-page">Forgot your password?</h1>
      <p className="mt-1.5 text-ink-2">Enter your username and we&apos;ll email you a link to choose a new Ramblin&apos; Repairs password.</p>
      <ForgotForm />
    </div>
  );
}
