"use client";

import { useId } from "react";
import { SSO_ENABLED } from "@/config/app";

/**
 * Placeholder for Georgia Tech single sign-on.
 *
 * TODO: Wire to Better Auth genericOAuth (Microsoft Entra ID / GT CAS) once OIT
 * approves the app registration.
 *
 * Until then it's a focusable button announced as unavailable (aria-disabled,
 * not the disabled attribute), never submits the form, and does nothing.
 */
export function GtSsoButton() {
  const hintId = useId();
  if (SSO_ENABLED) return null; // The real button replaces this when SSO ships.
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-sm text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={hintId}
        onClick={() => {}}
        data-testid="gt-sso"
        className="mt-4 flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-[10px] border border-line-2 bg-surface-2 px-4 font-bold text-ink-2"
      >
        Sign in with Georgia Tech SSO
      </button>
      <p id={hintId} className="hint mt-1.5 text-center">
        Coming soon
      </p>
    </div>
  );
}
