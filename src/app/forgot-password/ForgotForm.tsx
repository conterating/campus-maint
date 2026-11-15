"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/auth-actions";
import { ErrorSummary, Field, StatusMessage } from "@/components/forms";

export function ForgotForm() {
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await forgotPasswordAction({ username });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? { username: res.error });
        setVersion((v) => v + 1);
        return;
      }
      setErrors({});
      setSent(true);
    });
  }

  return (
    <div className="card mt-6 p-5 md:p-6">
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary errors={errors} version={version} />
        <Field id="username" label="Username" hint="Your GT username, or the contractor username from your invite." error={errors.username}>
          {(a) => <input {...a} className="field" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a reset link"}
        </button>
      </form>
      <StatusMessage>{sent ? "If there's an account for that username, we sent a reset link to its email. The link expires in 1 hour." : null}</StatusMessage>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="font-bold text-navy underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
