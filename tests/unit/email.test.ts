// sendEmail: dev outbox without a key, and a safe, visible fallback when Resend refuses.
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const tmp = mkdtempSync(path.join(os.tmpdir(), "rr-mail-"));
vi.spyOn(process, "cwd").mockReturnValue(tmp);
const { sendEmail, DEV_OUTBOX } = await import("@/lib/email");

const mail = { to: "gburdell3@gatech.edu", subject: "Hi", text: "t", link: "http://localhost:3000/x?token=SECRET", kind: "verify" as const };
afterEach(() => {
  vi.unstubAllEnvs();
  send.mockReset();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("writes to the dev outbox without a Resend key", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail(mail)).toMatchObject({ ok: true });
    expect(readFileSync(DEV_OUTBOX, "utf8")).toContain("token=SECRET");
  });

  it("reports a Resend rejection, logs no token, and still saves a dev copy", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "only your own address" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await sendEmail({ ...mail, subject: "Resend failure" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("only your own address");
    const logged = err.mock.calls.flat().join(" ");
    expect(logged).toContain("gatech.edu");
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("gburdell3");
    expect(readFileSync(DEV_OUTBOX, "utf8")).toContain("Resend failure");
  });

  it("redirects to EMAIL_REDIRECT_TO with a subject tag and no testing sentence", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_REDIRECT_TO", "inbox@example.com");
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(mail);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "inbox@example.com", subject: "[for gburdell3@gatech.edu] Hi", text: "t" }));
    expect(JSON.stringify(send.mock.calls[0][0])).not.toMatch(/testing mode|meant for/i);
    send.mockClear();
    await sendEmail({ ...mail, to: "Inbox@Example.com" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Hi", text: "t" }));
  });

  it("treats a thrown error like a rejection", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    send.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendEmail(mail)).toMatchObject({ ok: false, error: "network down" });
  });
});
