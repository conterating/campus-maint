"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { changePasswordAction, confirmTwoFactorAction, disableTwoFactorAction, startTwoFactorAction } from "@/app/auth-actions";
import { ErrorSummary, Field, PasswordInput, StatusMessage, StrengthMeter, passwordHint } from "@/components/forms";

export function ChangePasswordForm({ username }: { username: string }) {
  const [v, setV] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    start(async () => {
      const res = await changePasswordAction(v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? { form: res.error });
        setVersion((n) => n + 1);
        return;
      }
      setErrors({});
      setV({ currentPassword: "", password: "", confirmPassword: "" });
      setDone(true);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <ErrorSummary errors={errors} message={errors.form} version={version} />
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <Field id="currentPassword" label="Current password" error={errors.currentPassword}>
        {(a) => <PasswordInput {...a} autoComplete="current-password" value={v.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />}
      </Field>
      <Field id="password" label="New password" hint={passwordHint("it can't contain your username")} error={errors.password}>
        {(a) => (
          <>
            <PasswordInput {...a} autoComplete="new-password" value={v.password} onChange={(e) => set("password", e.target.value)} />
            <StrengthMeter password={v.password} />
          </>
        )}
      </Field>
      <Field id="confirmPassword" label="Retype new password" error={errors.confirmPassword}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" value={v.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
      <StatusMessage>{done ? "Password changed. Other devices were signed out." : null}</StatusMessage>
    </form>
  );
}

type Setup = { totpURI: string; secret: string; backupCodes: string[] };

export function TwoFactorPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.totpURI, { margin: 1, width: 200 }).then(setQr, () => setQr(null));
  }, [setup]);

  const failed = (fe: Record<string, string> | undefined, msg: string) => {
    setErrors(fe ?? { form: msg });
    setVersion((n) => n + 1);
  };

  if (enabled && !setup) {
    return (
      <div className="mt-4">
        <p className="pill bg-[#ecfdf3] text-resolved">On</p>
        <StatusMessage>{status}</StatusMessage>
        {!required && (
          <form
            noValidate
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await disableTwoFactorAction({ password });
                if (!res.ok) return failed(res.fieldErrors, res.error);
                setErrors({});
                setPassword("");
                setStatus("Two-factor sign-in is off.");
                router.refresh();
              });
            }}
          >
            <ErrorSummary errors={errors} message={errors.form} version={version} />
            <Field id="tfa-off-password" label="Password" hint="Enter your password to turn off two-factor sign-in." error={errors.password}>
              {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
              Turn off two-factor sign-in
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!setup) {
    return (
      <form
        noValidate
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await startTwoFactorAction({ password });
            if (!res.ok) return failed(res.fieldErrors, res.error);
            setErrors({});
            setPassword("");
            setSetup(res.data);
          });
        }}
      >
        <ErrorSummary errors={errors} message={errors.form} version={version} />
        <StatusMessage>{status}</StatusMessage>
        <Field id="tfa-password" label="Password" hint="Confirm it's you to start setup." error={errors.password}>
          {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Starting…" : "Set up two-factor sign-in"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <ol className="list-decimal space-y-4 pl-5 text-sm text-ink-2">
        <li>
          Scan this code with your authenticator app, or enter the key by hand.
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded-lg ring-1 ring-line" />}
            <div>
              <p className="hint">Setup key</p>
              <p className="num break-all font-bold text-ink" data-testid="totp-secret">
                {setup.secret}
              </p>
            </div>
          </div>
        </li>
        <li>
          Save these backup codes somewhere safe. Each works once if you lose your phone.
          <ul className="num mt-2 grid grid-cols-2 gap-1 text-ink sm:grid-cols-5" aria-label="Backup codes">
            {setup.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </li>
        <li>Enter the 6-digit code your app shows now.</li>
      </ol>
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await confirmTwoFactorAction({ code });
            if (!res.ok) return failed(res.fieldErrors, res.error);
            setSetup(null);
            setCode("");
            setErrors({});
            setStatus("Two-factor sign-in is on.");
            router.refresh();
            if (required) router.push(res.data.redirectTo);
          });
        }}
      >
        <ErrorSummary errors={errors} message={errors.form} version={version} />
        <Field id="tfa-code" label="Verification code" error={errors.code}>
          {(a) => <input {...a} className="field num max-w-48 tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Turn on two-factor sign-in"}
        </button>
      </form>
    </div>
  );
}
