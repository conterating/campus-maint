import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building, DoorClosed, MapPinned, QrCode } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listMyTickets, listVisibleTickets } from "@/lib/tickets";
import { OPEN_STATUSES, isOpenStatus } from "@/lib/domain";
import { TicketList } from "@/components/TicketTag";
import { NotificationIcon } from "@/components/NotificationIcon";
import { relativeTime } from "@/lib/format";
import { compareQueue } from "@/lib/sla";

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(now));
  if (hour < 5 || hour >= 18) return "Good evening";
  if (hour < 12) return "Good morning";
  return "Good afternoon";
}

export default async function HomePage() {
  const { viewer, now } = await getContext();
  if (viewer.role === "STAFF") redirect("/staff");
  if (viewer.role === "ADMIN") redirect("/admin");

  const [mine, nearby, alerts, user] = await Promise.all([
    listMyTickets(prisma, viewer),
    listVisibleTickets(prisma, viewer, { status: { in: OPEN_STATUSES } }),
    prisma.notification.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.user.findUnique({ where: { id: viewer.id }, include: { residenceBuilding: true, room: true } }),
  ]);

  const myOpen = mine.filter((t) => isOpenStatus(t.status) || t.status === "RESOLVED");
  const mineIds = new Set(mine.map((t) => t.id));
  const trending = nearby
    .filter((t) => !mineIds.has(t.id))
    .sort((a, b) => b.meTooCount - a.meTooCount || compareQueue(a, b, now))
    .slice(0, 4);
  const first = viewer.name.split(" ")[0];
  const hall = user?.residenceBuilding;
  const room = user?.room;

  const quickStarts = [
    hall && room
      ? { href: `/report?building=${hall.id}&space=${room.id}`, Icon: DoorClosed, title: "In my room", detail: `${room.label}, ${hall.name.replace(" Residence Hall", "")}` }
      : null,
    hall ? { href: `/report?building=${hall.id}`, Icon: Building, title: "Shared areas in my hall", detail: "Hallways, bathrooms, laundry" } : null,
    { href: "/report", Icon: MapPinned, title: "Somewhere on campus", detail: "Library, dining, classrooms, gym" },
  ].filter(Boolean) as { href: string; Icon: typeof Building; title: string; detail: string }[];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <p className="text-sm text-ink-3">
        {greeting(now)}, {first}
        {hall ? ` · ${hall.name}${room ? `, ${room.label}` : ""}` : " · Off-campus student"}
      </p>

      {/* Hero: the one bold moment on the page, and it's the primary task. */}
      <section aria-labelledby="hero-title" className="relative mt-3 overflow-hidden rounded-[20px] bg-navy text-white shadow-[0_20px_40px_-20px_rgb(0_48_87/0.6)]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border-[28px] border-white/[0.04]" />
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-40 rounded-full border-[18px] border-buzz/10" />
        <div className="relative p-6 md:p-9">
          <h1 id="hero-title" className="h-display max-w-xl text-[2.25rem] md:text-[3.25rem]">
            Something broken? <span className="text-buzz">Tag&nbsp;it.</span>
          </h1>
          <p className="mt-3 max-w-lg text-[1.0625rem] leading-relaxed text-white/80">
            Tell us where. We route it to the right team in seconds, and you can watch it get fixed.
          </p>
          <ul className={`mt-6 grid gap-2.5 ${quickStarts.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {quickStarts.map((q) => (
              <li key={q.title}>
                <Link
                  href={q.href}
                  className="group flex h-full items-center gap-3 rounded-[14px] bg-white/[0.07] p-3.5 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.12] focus-visible:bg-white/[0.12]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-buzz text-navy-hover">
                    <q.Icon aria-hidden className="size-5" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{q.title}</span>
                    <span className="block truncate text-sm text-white/70">{q.detail}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-sm text-white/65">
            <QrCode aria-hidden className="size-4" /> See a Hivemind QR code on a door or machine? Scan it with your camera to skip straight to the form.
          </p>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="mine-title">
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 id="mine-title" className="h-section text-lg">
                Your open tickets
              </h2>
              <Link href="/tickets" className="text-sm font-bold text-navy hover:underline">
                All your issues
              </Link>
            </div>
            {myOpen.length ? (
              <TicketList tickets={myOpen.slice(0, 5)} now={now} />
            ) : (
              <div className="card px-6 py-10 text-center">
                <p className="font-bold">Nothing open right now</p>
                <p className="mt-1 text-sm text-ink-3">Issues you report or follow show up here with live status.</p>
              </div>
            )}
          </section>

          {trending.length > 0 && (
            <section aria-labelledby="trending-title">
              <div className="mb-3">
                <h2 id="trending-title" className="h-section text-lg">
                  Most reported near you
                </h2>
                <p className="mt-0.5 text-sm text-ink-3">Same problem? Open it and add a “me too” instead of filing a new one.</p>
              </div>
              <TicketList tickets={trending} now={now} />
            </section>
          )}
        </div>

        <aside aria-labelledby="alerts-title" className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id="alerts-title" className="h-section">
                Latest alerts
              </h2>
              <Link href="/notifications" className="text-sm font-bold text-navy hover:underline">
                See all
              </Link>
            </div>
            {alerts.length ? (
              <ul className="divide-y divide-line">
                {alerts.map((n) => (
                  <li key={n.id}>
                    <Link href={n.ticketId ? `/tickets/${n.ticketId}` : "/notifications"} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                      <NotificationIcon tone={n.tone} />
                      <span className="min-w-0">
                        <span className={`block text-sm leading-snug ${n.read ? "text-ink-2" : "font-bold text-ink"}`}>
                          {!n.read && <span className="sr-only">Unread: </span>}
                          {n.message}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-3">{relativeTime(n.createdAt, now)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-ink-3">No alerts yet.</p>
            )}
          </div>
          <Link href="/demo" className="flex items-center justify-between rounded-[14px] border border-dashed border-line-2 px-4 py-3 text-sm font-bold text-ink-2 hover:border-navy hover:text-navy">
            Demo: switch user or fast-forward time <ArrowRight aria-hidden className="size-4" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
