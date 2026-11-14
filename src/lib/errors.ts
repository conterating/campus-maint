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
  if (err instanceof AppError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
}
