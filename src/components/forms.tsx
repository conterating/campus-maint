"use client";

import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { PASSWORD_HINT, passwordStrength } from "@/lib/auth-schemas";

// Accessible form building blocks for the account pages: visible labels, hints
// and errors tied to inputs with aria-describedby, an error summary that takes
// focus after a failed submit, and a password field with a show/hide toggle.

export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (a11y: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
  className?: string;
};

export function Field({ id, label, hint, error, optional, children, className = "" }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="hint -mt-1 mb-1.5">
          {hint}
        </p>
      )}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-bold text-emergency">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Errors listed at the top of the form. Takes focus when it appears (or changes). */
export function ErrorSummary({ title = "There's a problem", errors, message, version }: { title?: string; errors: Record<string, string>; message?: ReactNode; version: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(([k]) => k !== "form");
  const show = entries.length > 0 || !!message;
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show, version]);
  if (!show) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="mb-5 rounded-[12px] bg-emergency-bg p-4 ring-1 ring-inset ring-emergency/25 outline-none focus-visible:ring-2 focus-visible:ring-emergency">
      <h2 id="error-summary-title" className="flex items-center gap-2 font-bold text-emergency">
        <AlertCircle aria-hidden className="size-5" /> {title}
      </h2>
      {message && <div className="mt-1.5 text-sm text-ink">{message}</div>}
      {entries.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
          {entries.map(([field, msg]) => (
            <li key={field}>
              <a href={`#${field}`} className="font-bold text-emergency underline underline-offset-2">
                {msg}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Polite status line for async results (sent, saved, ...). */
export function StatusMessage({ tone = "ok", children }: { tone?: "ok" | "error"; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      {children && (
        <p className={`mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-sm font-bold ring-1 ring-inset ${tone === "ok" ? "bg-[#ecfdf3] text-resolved ring-resolved/20" : "bg-emergency-bg text-emergency ring-emergency/20"}`}>
          {tone === "ok" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
          <span>{children}</span>
        </p>
      )}
    </div>
  );
}

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { autoComplete: "current-password" | "new-password" };

/** Password input with a show/hide toggle that keeps password managers working. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} {...props} type={shown ? "text" : "password"} className={`field pr-[5.5rem] ${props.className ?? ""}`} spellCheck={false} autoCapitalize="none" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute right-1.5 top-1/2 flex min-h-8 min-w-[4.5rem] -translate-y-1/2 items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink"
      >
        {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
});

/** The hint every new-password field shows. */
export function passwordHint(extra?: string) {
  return (
    <>
      {PASSWORD_HINT} Use 12 or more characters{extra ? `; ${extra}` : ""}.
    </>
  );
}

export function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const id = useId();
  const colors = ["bg-line-2", "bg-emergency", "bg-urgent", "bg-standard", "bg-resolved"];
  return (
    <div className="mt-2" aria-live="polite">
      <div aria-hidden className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= score && password ? colors[score] : "bg-line"}`} />
        ))}
      </div>
      <p id={id} className="hint mt-1">
        Strength: <span className="font-bold text-ink-2">{password ? label : "—"}</span>
      </p>
    </div>
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  children,
  describedBy,
  invalid,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-6 cursor-pointer items-start gap-2.5 text-sm text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="mt-0.5 size-5 shrink-0 accent-[var(--navy)]"
      />
      <span>{children}</span>
    </label>
  );
}
