import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, QrCode } from "lucide-react";
import { prisma } from "@/lib/db";
import { demoModeEnabled, getContextOrGuest } from "@/lib/session";
import { GuestHome } from "./GuestHome";
import { listMyTickets, listVisibleTickets, shortName } from "@/lib/tickets";
import { DEPARTMENT_LABEL, OPEN_STATUSES, formatTicketNumber, isOpenStatus, type Department } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { compareQueue } from "@/lib/sla";
import { stageCaption } from "@/components/Progress";
import { StatusPill, SeverityText } from "@/components/badges";
import { TicketThumb } from "@/components/TicketTag";
import { placeText } from "@/components/WorkOrder";
import { EmptyState } from "@/components/EmptyState";
import { HomeComposer } from "./HomeComposer";

/** Short hall name for chips: "Glenn Residence Hall" → "Glenn". */
function hallShort(name: string) {
  return name.replace(/ (Residence Hall|Apartments|Houses)$/, "");
}

export default async function HomePage() {
  const { viewer, now, guest } = await getContextOrGuest();
  if (guest) return <GuestHome viewer={viewer} now={now} />;
  if (viewer.role === "STAFF") redirect("/staff");
  if (viewer.role === "ADMIN") redirect("/admin");
  if (viewer.role === "CONTRACTOR") redirect("/jobs");

  const [mine, nearby, user] = await Promise.all([
    listMyTickets(prisma, viewer),
    listVisibleTickets(prisma, viewer, { status: { in: OPEN_STATUSES } }),
    prisma.user.findUnique({ where: { id: viewer.id }, include: { residenceBuilding: true, room: true } }),
  ]);

  const active = mine.filter((t) => isOpenStatus(t.status) || t.status === "RESOLVED").slice(0, 4);
  const latest = active.length
    ? await prisma.ticketEvent.findMany({
        where: { ticketId: { in: active.map((t) => t.id) }, internal: false, type: { in: ["STATUS", "NOTE"] }, actor: { role: { not: "STUDENT" } } },
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, department: true } } },
      })
    : [];
  // The newest thing staff actually said: a note, or the message attached to a status change.
  const latestFor = (id: string) => {
    for (const e of latest) {
      if (e.ticketId !== id) continue;
      if (e.type === "NOTE") return { who: e.actor, text: e.message };
      const note = e.message.split(" — ")[1];
      if (note) return { who: e.actor, text: note };
    }
    return null;
  };

  const mineIds = new Set(mine.map((t) => t.id));
  const trending = nearby
    .filter((t) => !mineIds.has(t.id) && t.meTooCount > 0)
    .sort((a, b) => b.meTooCount - a.meTooCount || compareQueue(a, b, now))
    .slice(0, 5);

  const hall = user?.residenceBuilding;
  const room = user?.room;
  const places = [
    room && hall ? { value: "room", label: "My room", detail: room.label } : null,
    hall ? { value: "hall", label: `${hallShort(hall.name)} shared areas`, detail: "Halls, baths, laundry" } : null,
    { value: "campus", label: "Somewhere on campus", detail: "Classrooms, library, dining, gym" },
  ].filter(Boolean) as { value: string; label: string; detail: string }[];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-16">
      <section aria-labelledby="hero-title" className="max-w-3xl">
        <p className="wo-label">
          {viewer.name.split(" ")[0]}
          {hall ? `, ${hall.name}${room ? ` ${room.label}` : ""}` : ", off campus"}
        </p>
        <h1 id="hero-title" className="h-hero mt-3 max-w-[11ch] md:text-[6rem] md:leading-[0.86]">
          What needs fixing?
        </h1>
        <HomeComposer places={places} />
        <p className="mt-4 flex items-center gap-2 text-[0.9375rem] text-ink-3"><QrCode aria-hidden className="size-4 shrink-0" />Spotted a Ramblin’ Repairs sticker on a door or machine? Scan it to skip straight to the form.</p>
      </section>

      <div className="mt-20 grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="mine-title" className="min-w-0">
          <div className="rule-head">
            <h2 id="mine-title" className="h-section text-[1.625rem]">
              Your reports
            </h2>
            <Link href="/tickets" className="link-action text-[0.9375rem]">
              See all
            </Link>
          </div>
          {active.length ? (
            <ul className="stagger divide-y divide-line">
              {active.map((t) => {
                const update = latestFor(t.id);
                const needsYou = t.status === "RESOLVED" && t.reporterId === viewer.id;
                return (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="group flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-surface-2 md:px-5">
                      <TicketThumb ticket={t} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold leading-snug text-ink group-hover:text-navy">{t.summary}</h3>
                          <span className="shrink-0 pt-0.5 text-xs text-ink-3">{relativeTime(t.updatedAt, now)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-ink-3">
                          <span className="num">{formatTicketNumber(t.number)}</span> · {placeText(t.building.name, t.space?.label, t.asset?.name)}
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem]">
                          <StatusPill status={t.status} size="sm" />
                          <SeverityText severity={t.severity} />
                          <span className={needsYou ? "font-semibold text-resolved" : t.status === "REOPENED" ? "text-[var(--st-reopened)]" : "text-ink-3"}>
                            {needsYou ? "Fixed? Tap to confirm" : stageCaption(t.status)}
                          </span>
                        </p>
                        {update && (
                          <p className="mt-2.5 border-l-2 border-line-2 pl-3 text-sm text-ink-2">
                            <span className="font-semibold text-ink">
                              {update.who ? `${shortName(update.who.name)}, ${DEPARTMENT_LABEL[update.who.department as Department] ?? "Staff"}` : "Ramblin’ Repairs"}:
                            </span>{" "}
                            “{update.text}”
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState art="tag" title="No work orders yet">
              If something breaks between here and the Campanile, report it above and track it here.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="trending-title">
          <div className="rule-head">
            <h2 id="trending-title" className="h-section text-[1.625rem]">
              Most reported near you
            </h2>
          </div>
          <p className="mt-3 text-[0.9375rem] text-ink-3">Most-reported open issues. Same problem? Add a “me too” instead of a new report.</p>
          {trending.length ? (
            <ol className="stagger mt-2 divide-y divide-line">
              {trending.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.id}`} className="group grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 py-3.5">
                    <span className="font-display text-[2.5rem] font-extrabold leading-[0.8] text-navy">
                      {t.meTooCount + 1}
                      <span className="sr-only"> reports:</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold leading-snug text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">{t.summary}</span>
                      <span className="mt-0.5 block text-[0.9375rem] text-ink-3">{t.building.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-ink-3">Quiet around here. Nothing’s piling up.</p>
          )}
          <Link href="/map" className="link-action mt-5 inline-flex items-center gap-1.5 text-[0.9375rem]">
            See it all on the map <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      </div>

      {/* Demo controls are admin-only; this shows when an admin is viewing as a student. */}
      {viewer.impersonator && demoModeEnabled() && (
        <p className="mt-20 border-t border-line pt-5 text-[0.9375rem] text-ink-3">
          Trying the demo?{" "}
          <Link href="/demo" className="link-action">
            Switch user or fast-forward the clock
          </Link>
        </p>
      )}
    </div>
  );
}
