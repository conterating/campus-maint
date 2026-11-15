import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Phone, QrCode } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listMyTickets, listVisibleTickets, shortName } from "@/lib/tickets";
import { DEPARTMENT_LABEL, OPEN_STATUSES, formatTicketNumber, isOpenStatus, type Department } from "@/lib/domain";
import { APP_CONFIG } from "@/config/app";
import { relativeTime } from "@/lib/format";
import { compareQueue } from "@/lib/sla";
import { ProgressBar, stageCaption } from "@/components/Progress";

/** Short hall name for choices: "Glenn Residence Hall" → "Glenn". */
function hallShort(name: string) {
  return name.replace(/ (Residence Hall|Apartments|Houses)$/, "");
}

export default async function HomePage() {
  const { viewer, now } = await getContext();
  if (viewer.role === "STAFF") redirect("/staff");
  if (viewer.role === "ADMIN") redirect("/admin");

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
    room && hall ? { value: "room", label: "My room", detail: `${room.label}, ${hallShort(hall.name)}` } : null,
    hall ? { value: "hall", label: "Shared areas", detail: `Halls, baths, laundry in ${hallShort(hall.name)}` } : null,
    { value: "campus", label: "Elsewhere on campus", detail: "Classrooms, library, dining, gym" },
  ].filter(Boolean) as { value: string; label: string; detail: string }[];
  const police = APP_CONFIG.campusPolice;

  return (
    <div>
      <section aria-labelledby="hero-title" className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 md:pb-14 md:pt-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">
              <span className="font-bold text-ink">{viewer.name}</span>
              {hall ? ` · ${hall.name}${room ? `, ${room.label}` : ""}` : " · Lives off campus"}
            </p>
            <h1 id="hero-title" className="h-hero mt-3">
              What needs fixing?
            </h1>

            <form action="/report" method="get" className="mt-7 max-w-2xl">
              <label htmlFor="home-desc" className="label">
                Describe the problem
              </label>
              <textarea
                id="home-desc"
                name="desc"
                rows={3}
                maxLength={2000}
                placeholder="e.g. The shower in the 2nd floor bathroom has no hot water."
                className="field min-h-24 resize-y text-[1.0625rem]"
              />
              <fieldset className="mt-5">
                <legend className="label">Where is it?</legend>
                <div className={`grid grid-cols-1 gap-2 ${places.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  {places.map((p, i) => (
                    <label
                      key={p.value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-[5px] border border-[#aeb6c2] bg-surface p-3 transition-colors hover:border-navy has-[:checked]:border-navy has-[:checked]:shadow-[inset_0_0_0_1px_var(--navy)]"
                    >
                      <input type="radio" name="where" value={p.value} defaultChecked={i === 0} className="mt-1 size-4 shrink-0 accent-[var(--navy)]" />
                      <span className="min-w-0">
                        <span className="block font-bold leading-tight text-ink">{p.label}</span>
                        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{p.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="btn btn-accent mt-6 w-full sm:w-auto">
                Continue <ArrowRight aria-hidden className="size-4" />
              </button>
            </form>
          </div>

          <aside className="space-y-6 self-end text-sm lg:pb-1">
            <div className="border-l-[3px] border-emergency pl-4">
              <p className="font-bold text-ink">Gas smell, flooding, sparks, or someone stuck?</p>
              <p className="mt-1 text-ink-2">Don&apos;t wait on a report. Call {police.label}.</p>
              <a href={`tel:${police.tel}`} className="mt-2 inline-flex items-center gap-2 font-bold text-emergency underline decoration-2 underline-offset-4">
                <Phone aria-hidden className="size-4" />
                {police.phone}
              </a>
            </div>
            <div className="border-l-[3px] border-line-2 pl-4">
              <p className="flex items-center gap-2 font-bold text-ink">
                <QrCode aria-hidden className="size-4" /> Found a sticker?
              </p>
              <p className="mt-1 text-ink-2">Every door and machine with a Ramblin’ Repairs QR sticker opens this form with the location filled in.</p>
            </div>
          </aside>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
        <section aria-labelledby="mine-title" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-navy pb-2">
            <h2 id="mine-title" className="font-display text-[1.75rem] font-extrabold leading-none text-navy">
              Your reports
            </h2>
            <Link href="/tickets" className="text-sm font-bold text-navy underline-offset-4 hover:underline">
              All reports
            </Link>
          </div>
          {active.length ? (
            <ul className="divide-y divide-line">
              {active.map((t) => {
                const update = latestFor(t.id);
                const needsYou = t.status === "RESOLVED" && t.reporterId === viewer.id;
                return (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="group block py-5">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-[1.0625rem] font-bold leading-snug text-ink group-hover:text-navy group-hover:underline group-hover:underline-offset-4">{t.summary}</h3>
                        <span className="shrink-0 pt-0.5 text-sm tabular-nums text-ink-3">{formatTicketNumber(t.number)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-3">{[t.building.name, t.space?.label, t.asset?.name].filter(Boolean).join(" · ")}</p>
                      <p className="mt-3.5 text-sm">
                        <span className={`font-bold ${needsYou ? "text-resolved" : t.status === "REOPENED" ? "text-[var(--st-reopened)]" : "text-ink"}`}>
                          {needsYou ? "Fixed? Confirm it" : stageCaption(t.status)}
                        </span>
                        <span className="text-ink-3"> · updated {relativeTime(t.updatedAt, now)}</span>
                      </p>
                      <div className="mt-2 max-w-md">
                        <ProgressBar status={t.status} />
                      </div>
                      {update && (
                        <p className="mt-3 text-sm text-ink-2">
                          “{update.text}”{" "}
                          <span className="whitespace-nowrap text-ink-3">
                            — {update.who ? `${shortName(update.who.name)}, ${DEPARTMENT_LABEL[update.who.department as Department] ?? "Staff"}` : "Ramblin’ Repairs"}
                          </span>
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-ink-2">Nothing in progress. Problems you report or follow show up here, with every update.</p>
          )}
        </section>

        <section aria-labelledby="trending-title">
          <div className="border-b-2 border-navy pb-2">
            <h2 id="trending-title" className="font-display text-[1.75rem] font-extrabold leading-none text-navy">
              Reported near you
            </h2>
          </div>
          <p className="mt-3 text-sm text-ink-3">Same problem? Open it and add a “me too” instead of a new report.</p>
          {trending.length ? (
            <ol className="mt-2 divide-y divide-line">
              {trending.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.id}`} className="group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-3">
                    <span className="text-right font-display text-[1.75rem] font-extrabold leading-none text-navy">
                      {t.meTooCount + 1}
                      <span className="sr-only"> people:</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold leading-snug text-ink group-hover:text-navy group-hover:underline group-hover:underline-offset-4">{t.summary}</span>
                      <span className="mt-0.5 block truncate text-sm text-ink-3">{t.building.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-3">Nothing popular right now.</p>
          )}
          <p className="mt-2 text-xs text-ink-3">Number = people who reported it.</p>
          <Link href="/map" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy underline-offset-4 hover:underline">
            See everything on the map <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      </div>

      <p className="mx-auto mt-16 max-w-6xl px-4 text-sm text-ink-3">
        <span className="block border-t border-line pt-5">
          Trying the demo?{" "}
          <Link href="/demo" className="font-bold text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-navy hover:decoration-navy">
            Switch user or fast-forward the clock
          </Link>
        </span>
      </p>
    </div>
  );
}
