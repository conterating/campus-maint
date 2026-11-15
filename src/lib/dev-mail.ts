/** The dev mailbox page exists only outside production and only in demo mode. */
export function devMailboxAvailable(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}

/** The testing inbox all app email is redirected to (EMAIL_REDIRECT_TO), outside production. Mirrors src/lib/email.ts. */
export function mailRedirectedTo(): string | null {
  const to = process.env.EMAIL_REDIRECT_TO?.trim();
  if (!to || !to.includes("@") || !process.env.RESEND_API_KEY) return null;
  if (process.env.NODE_ENV === "production" && process.env.EMAIL_REDIRECT_IN_PRODUCTION !== "1") return null;
  return to;
}

/** True when mail goes to the local outbox instead of a real provider. */
export function mailIsLocalOnly(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
}
