import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { devMailboxAvailable } from "@/lib/dev-mail";
import { readOutbox } from "@/lib/email";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Local-only view of .mail/outbox.jsonl. Not found in production or without DEMO_MODE=true. */
export default async function DevMailPage() {
  if (!devMailboxAvailable()) notFound();
  // Loopback only: the page lists live links, so it must not be reachable by Host-header tricks or a LAN.
  const host = ((await headers()).get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) notFound();
  const mails = await readOutbox(50);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:pt-12">
      <h1 className="h-page">Dev mailbox</h1>
      <p className="mt-1.5 max-w-prose text-ink-2">
        Email isn&apos;t sent from this machine. Messages the app would have emailed land here instead (newest first, last 50). Open the link to confirm an account or reset a password.
      </p>
      {mails.length === 0 ? (
        <p className="card mt-6 p-5 text-ink-2">No messages yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {mails.map((m, i) => (
            <li key={`${m.sentAt}-${i}`} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold text-ink">{m.subject}</p>
                <p className="text-sm text-ink-2">
                  To {m.to} · {m.kind} · <time dateTime={m.sentAt}>{new Date(m.sentAt).toLocaleString()}</time>
                </p>
              </div>
              <a href={m.link} className="btn btn-primary btn-sm">
                Open link
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
