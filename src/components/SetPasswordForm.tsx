"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInviteAction, resetPasswordAction } from "@/app/auth-actions";
import { ErrorSummary, Field, PasswordInput, StrengthMeter, passwordHint } from "@/components/forms";

/** Choose a new password from a reset link or an invite link. */
export function SetPasswordForm({ token, mode, username }: { token: string; mode: "reset" | "invite"; username?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [version, setVersion] = useState(0);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = mode === "reset" ? await resetPasswordAction({ token, password, confirmPassword }) : await acceptInviteAction({ token, password, confirmPassword });
      if (res.ok) {
        router.replace(mode === "reset" ? "/login?reset=1" : "/login?invited=1");
        return;
      }
      setErrors(res.fieldErrors ?? {});
      setFormError(
        res.code === "EXPIRED" ? (
          <p>
            {res.error}{" "}
            {mode === "reset" && (
              <Link href="/forgot-password" className="font-bold text-navy underline underline-offset-2">
                Request a new link
              </Link>
            )}
          </p>
        ) : res.fieldErrors ? null : (
          res.error
        ),
      );
      setVersion((v) => v + 1);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="card mt-6 space-y-4 p-5 md:p-6">
      <ErrorSummary errors={errors} message={formError} version={version} />
      {/* Lets password managers save the new password under the right username. */}
      <input type="text" name="username" autoComplete="username" value={username ?? ""} readOnly hidden />
      <Field id="password" label="New password" hint={passwordHint("it can't contain your username")} error={errors.password}>
        {(a) => (
          <>
            <PasswordInput {...a} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <StrengthMeter password={password} />
          </>
        )}
      </Field>
      <Field id="confirmPassword" label="Retype new password" error={errors.confirmPassword}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : mode === "reset" ? "Change password" : "Create password"}
      </button>
    </form>
  );
}
