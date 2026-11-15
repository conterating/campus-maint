import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { demoModeEnabled, getContextOrGuest } from "@/lib/session";
import { GuestHome } from "./GuestHome";
import { listMyTickets, listVisibleTickets, shortName } from "@/lib/tickets";
import { DEPARTMENT_LABEL, OPEN_STATUSES, isOpenStatus, type Department } from "@/lib/domain";
import { compareQueue } from "@/lib/sla";
import { APP_CONFIG } from "@/config/app";
import { TicketRow } from "@/components/TicketTag";
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

  const police = APP_CONFIG.campusPolice;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-16">
      {/* Hero row: the headline and composer, with a sidebar lined up to the headline. */}
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="hero-title" className="min-w-0">
          <p className="wo-label">
            {viewer.name.split(" ")[0]}
            {hall ? `, ${hall.name}${room ? ` ${room.label}` : ""}` : ", off campus"}
          </p>
          <h1 id="hero-title" className="h-hero mt-3 max-w-[11ch] md:text-[6rem] md:leading-[0.86]">
            What needs fixing?
          </h1>
          <HomeComposer places={places} />
        </section>

        <aside className="space-y-8 lg:pt-8" aria-label="Before you report">
          <section aria-labelledby="sos-title" className="overflow-hidden rounded-[6px] border-2 border-emergency">
            <div aria-hidden className="hazard h-2" />
            <div className="p-4">
              <h2 id="sos-title" className="font-display text-[1.375rem] font-extrabold uppercase leading-none text-emergency">
                Danger right now?
              </h2>
              <p className="mt-2 text-[0.9375rem] text-ink-2">Gas smell, flooding, sparks, or someone stuck: leave the area and call first. Report after.</p>
              <a href={`tel:${police.tel}`} className="btn btn-danger mt-3 w-full">
                <Phone aria-hidden className="size-4" />
                <span className="num text-[1.125rem]">{police.phone}</span>
              </a>
              <p className="mt-1.5 text-center text-sm text-ink-3">{police.label}</p>
            </div>
          </section>

          <section aria-labelledby="qr-title" className="flex gap-4">
            <QrSticker />
            <div>
              <h2 id="qr-title" className="font-display text-[1.25rem] font-bold uppercase leading-none text-navy">
                See a sticker?
              </h2>
              <p className="mt-1.5 text-[0.9375rem] text-ink-2">Doors and machines with a Ramblin’ Repairs QR sticker open this form with the location filled in.</p>
            </div>
          </section>
        </aside>
      </div>

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
                    <TicketRow
                      ticket={t}
                      now={now}
                      time={t.updatedAt}
                      timeLabel="Updated"
                      statusText={needsYou ? <span className="font-bold text-st-fixed">Fixed? Confirm it</span> : undefined}
                      note={
                        update && (
                          <p className="mt-2 border-l-[3px] border-navy pl-3 text-[0.9375rem] text-ink-2">
                            “{update.text}”{" "}
                            <span className="whitespace-nowrap text-ink-3">
                              {update.who ? `${shortName(update.who.name)}, ${DEPARTMENT_LABEL[update.who.department as Department] ?? "Staff"}` : "Ramblin’ Repairs"}
                            </span>
                          </p>
                        )
                      }
                    />
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
              Near you
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

/** A tiny drawn QR sticker on a door tag. */
function QrSticker() {
  return (
    <svg aria-hidden viewBox="0 0 56 56" className="size-14 shrink-0">
      <rect x="3" y="3" width="50" height="50" rx="5" fill="#f3ebcf" stroke="#003057" strokeWidth="2.5" />
      <g fill="#003057">
        <rect x="11" y="11" width="12" height="12" rx="1.5" />
        <rect x="33" y="11" width="12" height="12" rx="1.5" />
        <rect x="11" y="33" width="12" height="12" rx="1.5" />
        <rect x="33" y="33" width="5" height="5" />
        <rect x="40" y="40" width="5" height="5" />
        <rect x="33" y="40" width="3" height="3" />
        <rect x="27" y="27" width="3" height="3" />
      </g>
      <g fill="#f3ebcf">
        <rect x="14" y="14" width="6" height="6" />
        <rect x="36" y="14" width="6" height="6" />
        <rect x="14" y="36" width="6" height="6" />
      </g>
    </svg>
  );
}
