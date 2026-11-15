"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginAction, resendVerificationAction, verifyBackupCodeAction, verifyTotpAction } from "@/app/auth-actions";
import { ErrorSummary, Field, PasswordInput, StatusMessage, Checkbox } from "@/components/forms";
import { LOGIN_TABS, type LoginTab } from "@/lib/auth-schemas";
import { GtSsoButton } from "./GtSsoButton";

const TABS: Record<LoginTab, { label: string; href: string; usernameLabel: string; usernameHint: string }> = {
  student: { label: "Student", href: "/login", usernameLabel: "GT username", usernameHint: "Like gburdell3. You can paste your @gatech.edu address." },
  contractor: { label: "Contractor", href: "/login/contractor", usernameLabel: "Contractor username", usernameHint: "The username in your invite email." },
  staff: {
    label: "Staff & Administrator",
    href: "/login/staff",
    usernameLabel: "GT username",
    usernameHint: "Like gburdell3. You can paste your @gatech.edu address.",
  },
};

type Step = "password" | "totp" | "backup";

export function LoginForm({ tab: initialTab, next, notice }: { tab: LoginTab; next?: string; notice: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<LoginTab>(initialTab);
  const [step, setStep] = useState<Step>("password");
  const [resendOpen, setResendOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [code, setCode] = useState("");
  const [resendUser, setResendUser] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [status, setStatus] = useState<string | null>(notice);
  const [version, setVersion] = useState(0);
  const [pending, start] = useTransition();
  const tabRefs = useRef<Record<LoginTab, HTMLButtonElement | null>>({ student: null, contractor: null, staff: null });
  const base = useId();
  const cfg = TABS[tab];

  function selectTab(t: LoginTab, focus = false) {
    setTab(t);
    setErrors({});
    setFormError(null);
    // Each tab has its own URL; replace so Back still leaves the page.
    window.history.replaceState(null, "", TABS[t].href + (next ? `?next=${encodeURIComponent(next)}` : ""));
    if (focus) tabRefs.current[t]?.focus();
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = LOGIN_TABS.indexOf(tab);
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: LOGIN_TABS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const t = LOGIN_TABS[(map[e.key] + LOGIN_TABS.length) % LOGIN_TABS.length];
    selectTab(t, true);
  }

  function failed(error: string, fieldErrs: Record<string, string> = {}) {
    setErrors(fieldErrs);
    setFormError(Object.keys(fieldErrs).length ? null : error);
    setVersion((v) => v + 1);
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setUnverified(false);
    start(async () => {
      const res = await loginAction({ username, password, rememberMe, tab, next });
      if (!res.ok) {
        if (res.code === "EMAIL_NOT_VERIFIED") {
          setUnverified(true);
          failed(res.error);
          return;
        }
        setPassword("");
        failed(res.error, res.fieldErrors);
        return;
      }
      if ("twoFactor" in res.data) {
        setErrors({});
        setFormError(null);
        setStep("totp");
        return;
      }
      router.replace(res.data.redirectTo);
      router.refresh();
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = step === "totp" ? await verifyTotpAction({ code, next }) : await verifyBackupCodeAction({ code, next });
      if (!res.ok) {
        if (res.code === "RESTART") {
          setStep("password");
          setPassword("");
          setCode("");
        }
        failed(res.error, res.fieldErrors);
        return;
      }
      router.replace(res.data.redirectTo);
      router.refresh();
    });
  }

  function resend(name = username) {
    start(async () => {
      await resendVerificationAction(name);
      setStatus("If that account is waiting for confirmation, we sent a new link. Check your email.");
    });
  }

  if (step !== "password") {
    const backup = step === "backup";
    return (
      <div className="card mt-6 p-5 md:p-6">
        <h2 className="h-section text-lg">{backup ? "Use a backup code" : "Enter your verification code"}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {backup
            ? "Enter one of the backup codes you saved when you set up two-factor sign-in. Each code works once."
            : "Open your authenticator app and enter the 6-digit code for Ramblin' Repairs."}
        </p>
        <form onSubmit={submitCode} noValidate className="mt-5 space-y-4">
          <ErrorSummary errors={errors} message={formError} version={version} />
          <Field id="code" label={backup ? "Backup code" : "Verification code"} error={errors.code}>
            {(a) => (
              <input
                {...a}
                name="code"
                className="field num tracking-widest"
                inputMode={backup ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                maxLength={backup ? 32 : 8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Checking…" : "Verify and sign in"}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <button
            type="button"
            className="min-h-6 font-bold text-navy underline underline-offset-2"
            onClick={() => {
              setStep(backup ? "totp" : "backup");
              setCode("");
              setErrors({});
              setFormError(null);
            }}
          >
            {backup ? "Use my authenticator app" : "Use a backup code"}
          </button>
          <button
            type="button"
            className="min-h-6 font-bold text-ink-2 underline underline-offset-2"
            onClick={() => {
              setStep("password");
              setPassword("");
              setCode("");
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Account type" className="seg flex w-full">
        {LOGIN_TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            id={`${base}-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`${base}-panel`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => selectTab(t)}
            onKeyDown={onTabKey}
            className="!whitespace-normal text-center leading-tight"
          >
            {TABS[t].label}
          </button>
        ))}
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`} className="card mt-4 p-5 md:p-6">
        <StatusMessage>{status}</StatusMessage>
        <form onSubmit={submitPassword} noValidate className="space-y-4" aria-label={`${cfg.label} sign in`}>
          <ErrorSummary
            errors={errors}
            version={version}
            message={
              formError && (
                <>
                  <p>{formError}</p>
                  {unverified && (
                    <button type="button" onClick={() => resend()} disabled={pending} className="btn btn-secondary btn-sm mt-2">
                      Resend the email
                    </button>
                  )}
                </>
              )
            }
            title={unverified ? "Finish setting up your account" : "Couldn't sign in"}
          />
          <Field id="username" label={cfg.usernameLabel} hint={cfg.usernameHint} error={errors.username}>
            {(a) => (
              <input
                {...a}
                name="username"
                className="field"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
          <Field
            id="password"
            label="Password"
            hint={tab === "student" ? "Your Ramblin' Repairs password, not your Georgia Tech password." : undefined}
            error={errors.password}
          >
            {(a) => <PasswordInput {...a} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox id="remember" checked={rememberMe} onChange={setRememberMe}>
              Remember me for 7 days
            </Checkbox>
            <Link href="/forgot-password" className="min-h-6 text-sm font-bold text-navy underline underline-offset-2">
              Forgot password?
            </Link>
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* The resend form only mounts when opened, so the page has a single username field otherwise. */}
        <details className="mt-4 text-sm" onToggle={(e) => setResendOpen(e.currentTarget.open)}>
          <summary className="min-h-6 cursor-pointer font-bold text-navy underline underline-offset-2">Didn&apos;t get your confirmation email?</summary>
          {resendOpen && (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                resend(resendUser);
              }}
            >
              <label htmlFor={`${base}-resend-user`} className="block font-bold text-ink">
                Your username
              </label>
              <input
                id={`${base}-resend-user`}
                className="field"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={resendUser}
                onChange={(e) => setResendUser(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={pending || !resendUser.trim()}>
                Resend the email
              </button>
            </form>
          )}
        </details>

        {tab === "student" ? (
          <p className="mt-5 text-center text-sm text-ink-2">
            New to Ramblin&apos; Repairs?{" "}
            <Link href="/signup" className="font-bold text-navy underline underline-offset-2">
              Create a student account
            </Link>
          </p>
        ) : (
          <p className="mt-5 text-center text-sm text-ink-2">Accounts are created by an administrator.</p>
        )}

        {tab !== "contractor" && <GtSsoButton />}
      </div>
    </div>
  );
}
