/** An error whose message is safe and useful to show the person who triggered it. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" = "INVALID",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function toActionError(err: unknown): { ok: false; error: string } {
  // Next.js redirect()/notFound() work by throwing; let them through.
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) throw err;
  if (err instanceof AppError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
}
