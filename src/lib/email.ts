import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";

// Account email: verification, password reset, and invites.
//
// With RESEND_API_KEY set, mail goes out through Resend. Without it (local
// development and tests) the message is printed to the server console and
// appended to .mail/outbox.jsonl, so you can click the link yourself and the
// end-to-end tests can read it. Never put passwords in an email.

export type OutgoingEmail = { to: string; subject: string; text: string; link: string; kind: "verify" | "reset" | "invite" };

export const DEV_OUTBOX = path.join(process.cwd(), ".mail", "outbox.jsonl");

let resend: Resend | null = null;

export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    resend ??= new Resend(key);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Ramblin' Repairs <onboarding@resend.dev>",
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    // Log the outcome, never the message: it carries a single-use link.
    if (error) console.error(`[email] Resend rejected a "${mail.kind}" email: ${error.name}: ${error.message}`);
    else console.info(`[email] sent a "${mail.kind}" email through Resend (id ${data?.id})`);
    return;
  }

  // Development mailer. The link is the point of the message here, so it is printed.
  console.info(`\n[email] To: ${mail.to}\n[email] ${mail.subject}\n[email] ${mail.link}\n`);
  try {
    await mkdir(path.dirname(DEV_OUTBOX), { recursive: true });
    await appendFile(DEV_OUTBOX, JSON.stringify({ ...mail, sentAt: new Date().toISOString() }) + "\n");
  } catch {
    // The console copy is enough.
  }
}

export function appUrl(pathname: string): string {
  const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname}`;
}
