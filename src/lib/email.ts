import "server-only";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";

// Account email: verification, password reset, and invites.
//
// With RESEND_API_KEY set, mail goes out through Resend. Without it (local
// development and tests) the message is printed to the server console and
// appended to .mail/outbox.jsonl, so you can click the link yourself and the
// end-to-end tests can read it. Never put passwords in an email.

export type OutgoingEmail = { to: string; subject: string; text: string; link: string; kind: "verify" | "reset" | "invite" };
export type SendResult = { ok: boolean; id?: string; error?: string };

export const DEV_OUTBOX = path.join(process.cwd(), ".mail", "outbox.jsonl");

// The e2e suite runs a production build, so it opts in explicitly. Never set this on a real deployment.
const isProduction = () => process.env.NODE_ENV === "production" && process.env.E2E_LOCAL_MAILBOX !== "1";

let resend: Resend | null = null;

// Resend's shared sandbox sender only delivers to the Resend account owner, so
// a real deployment needs its own verified sender.
if (process.env.RESEND_API_KEY && !process.env.EMAIL_FROM && !process.env.EMAIL_REDIRECT_TO) {
  console.warn(
    "[email] RESEND_API_KEY is set but EMAIL_FROM is not. The default sender onboarding@resend.dev can only deliver to the Resend account owner, so students will not receive mail. Set EMAIL_FROM to an address on a domain verified in Resend.",
  );
}

const domainOf = (address: string) => address.split("@")[1] ?? "unknown";

/**
 * Optional testing redirect. Resend's shared sender (onboarding@resend.dev) only
 * delivers to the Resend account owner, so until a domain is verified, set
 * EMAIL_REDIRECT_TO to that owner's address: every app email goes there instead,
 * labelled with who it was meant for, and the link inside still works.
 * Ignored in production unless EMAIL_REDIRECT_IN_PRODUCTION=1 (it would hand
 * everyone's sign-in links to one inbox).
 */
function redirectTarget(): string | null {
  const to = process.env.EMAIL_REDIRECT_TO?.trim();
  if (!to || !to.includes("@")) return null;
  if (isProduction() && process.env.EMAIL_REDIRECT_IN_PRODUCTION !== "1") return null;
  return to;
}

/** Append to the local dev mailbox (.mail/outbox.jsonl). Returns false if it couldn't be written. */
async function writeOutbox(mail: OutgoingEmail): Promise<boolean> {
  try {
    await mkdir(path.dirname(DEV_OUTBOX), { recursive: true });
    await appendFile(DEV_OUTBOX, JSON.stringify({ ...mail, sentAt: new Date().toISOString() }) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** The newest messages in the dev mailbox, newest first. */
export async function readOutbox(limit = 50): Promise<(OutgoingEmail & { sentAt: string })[]> {
  try {
    const lines = (await readFile(DEV_OUTBOX, "utf8")).split("\n").filter(Boolean);
    const out: (OutgoingEmail & { sentAt: string })[] = [];
    for (const line of lines.slice(-limit).reverse()) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip a damaged line.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Never throws. The caller decides what a failure means; Better Auth just logs it. */
export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      resend ??= new Resend(key);
      const redirect = redirectTarget();
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "Ramblin' Repairs <onboarding@resend.dev>",
        to: redirect ?? mail.to,
        subject: redirect ? `[for ${mail.to}] ${mail.subject}` : mail.subject,
        text: redirect ? `This email was meant for ${mail.to}. It was redirected to you by EMAIL_REDIRECT_TO while email is in testing mode.\n\n${mail.text}` : mail.text,
      });
      if (!error) {
        // Log the outcome, never the message: it carries a single-use link.
        console.info(`[email] sent a "${mail.kind}" email through Resend (id ${data?.id})${redirect ? " to the EMAIL_REDIRECT_TO inbox" : ""}`);
        return { ok: true, id: data?.id };
      }
      return await failed(mail, `${error.name}: ${error.message}`);
    } catch (err) {
      return await failed(mail, err instanceof Error ? err.message : "unknown error");
    }
  }

  // Production without a mail provider: never print or store the link (it is a live credential).
  if (isProduction()) {
    console.error(`[email] email not configured: RESEND_API_KEY is not set, so a "${mail.kind}" email to a ${domainOf(mail.to)} address was NOT sent.`);
    return { ok: false, error: "Email is not configured." };
  }

  // Development mailer. The link is the point of the message here, so it is printed.
  console.info(`\n[email] To: ${mail.to}\n[email] ${mail.subject}\n[email] ${mail.link}\n`);
  const saved = await writeOutbox(mail);
  return saved ? { ok: true, id: "dev-outbox" } : { ok: true, id: "console" };
}

async function failed(mail: OutgoingEmail, error: string): Promise<SendResult> {
  // Kind and recipient domain only: no address, no token.
  console.error(`[email] FAILED to send a "${mail.kind}" email to a ${domainOf(mail.to)} address: ${error}`);
  if (!isProduction() && (await writeOutbox(mail))) console.warn("[email] a copy was saved to the dev mailbox (.mail/outbox.jsonl, /dev/mail).");
  return { ok: false, error };
}

/** True when mail can actually be delivered (a provider key, or the dev mailbox outside production). */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || !isProduction();
}

export function appUrl(pathname: string): string {
  const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname}`;
}
