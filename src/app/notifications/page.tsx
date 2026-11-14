import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { relativeTime, formatDateTime } from "@/lib/format";
import { NotificationIcon } from "@/components/NotificationIcon";
import { MarkAllRead } from "./MarkAllRead";

export const metadata: Metadata = { title: "Alerts" };

export default async function NotificationsPage() {
  const { viewer, now } = await getContext();
  const notes = await prisma.notification.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const unread = notes.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Alerts</h1>
          <p className="mt-1 text-sm text-ink-3">{unread ? `${unread} unread` : "You're all caught up."}</p>
        </div>
        {unread > 0 && <MarkAllRead />}
      </div>

      {notes.length ? (
        <ul className="list-group mt-6">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={n.ticketId ? `/tickets/${n.ticketId}` : "#"} className={`flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 ${n.read ? "" : "bg-navy-50/40"}`}>
                <NotificationIcon tone={n.tone} />
                <span className="min-w-0 flex-1">
                  <span className={`block leading-snug ${n.read ? "text-ink-2" : "font-bold text-ink"}`}>
                    {!n.read && <span className="sr-only">Unread. </span>}
                    {n.message}
                  </span>
                  <span className="mt-1 block text-[0.8125rem] text-ink-3">
                    <time dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)}>
                      {relativeTime(n.createdAt, now)}
                    </time>
                  </span>
                </span>
                {!n.read && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-navy" />}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card mt-6 px-6 py-14 text-center">
          <BellOff aria-hidden className="mx-auto size-8 text-line-2" />
          <p className="mt-3 font-bold">No alerts yet</p>
          <p className="mt-1 text-sm text-ink-3">You&apos;ll hear about every change to issues you report, own, or follow.</p>
        </div>
      )}
    </div>
  );
}
