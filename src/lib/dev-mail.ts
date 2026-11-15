/** The dev mailbox page exists only outside production and only in demo mode. */
export function devMailboxAvailable(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}

/** True when mail goes to the local outbox instead of a real provider. */
export function mailIsLocalOnly(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
}
