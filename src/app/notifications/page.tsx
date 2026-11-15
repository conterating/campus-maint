import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { relativeTime, formatDateTime } from "@/lib/format";
import { NotificationIcon } from "@/components/NotificationIcon";
import { MarkAllRead } from "./MarkAllRead";
import { EmptyState } from "@/components/EmptyState";
import { IdText } from "@/components/WorkOrder";

export const metadata: Metadata = { title: "Alerts" };

export default async function NotificationsPage() {
  const { viewer, now } = await getContext();
  const notes = await prisma.notification.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const unread = notes.filter((n) => !n.read).length;

  // Group by day (campus time) so the log reads like a dated work-order sheet.
  const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const dayKey = (d: Date) => dayFmt.format(d);
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const days: { label: string; items: typeof notes }[] = [];
  for (const n of notes) {
    const k = dayKey(n.createdAt);
    const label = k === today ? "Today" : k === yesterday ? "Yesterday" : k;
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-8 md:px-6 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Alerts</h1>
          <p className="mt-2 text-[1.0625rem] text-ink-2">
            {unread ? (
              <>
                <span className="num text-[1.25rem] text-navy">{unread}</span> unread
              </>
            ) : notes.length ? (
              "You're all caught up."
            ) : (
              "Updates on your reports land here."
            )}
          </p>
        </div>
        {unread > 0 && <MarkAllRead />}
      </div>

      {notes.length ? (
        <div className="mt-10 space-y-10">
          {days.map((d) => (
            <section key={d.label} aria-label={d.label}>
              <div className="rule-head">
                <h2 className="h-section">{d.label}</h2>
              </div>
              <ul className="stagger divide-y divide-line">
                {d.items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.ticketId ? `/tickets/${n.ticketId}` : (n.href && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "#")}
                      className={`group relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 py-4 pl-3 pr-2 transition-colors hover:bg-surface-2 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full ${
                        n.read ? "before:bg-transparent" : "bg-navy-50/50 before:bg-navy"
                      }`}
                    >
                      <span className="num pt-0.5 text-[0.9375rem] text-ink-3">
                        <time dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)}>
                          {timeFmt.format(n.createdAt)}
                        </time>
                      </span>
                      <span className="flex min-w-0 items-start gap-2.5">
                        <NotificationIcon tone={n.tone} />
                        <span className={`min-w-0 leading-snug group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4 ${n.read ? "text-ink-2" : "font-bold text-ink"}`}>
                          {!n.read && <span className="sr-only">Unread. </span>}
                          <IdText text={n.message} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {notes.length < 60 && <p className="text-center text-[0.9375rem] text-ink-3">That&apos;s everything from the last {relativeTime(notes[notes.length - 1].createdAt, now).replace(" ago", "")}.</p>}
        </div>
      ) : (
        <EmptyState art="clipboard" title="All caught up">
          Nothing new. You&apos;ll hear about every change to issues you report, own, or follow.
        </EmptyState>
      )}
    </div>
  );
}
