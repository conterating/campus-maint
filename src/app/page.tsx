import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, QrCode } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listMyTickets, listVisibleTickets, shortName } from "@/lib/tickets";
import { DEPARTMENT_LABEL, OPEN_STATUSES, formatTicketNumber, isOpenStatus, type Department } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { compareQueue } from "@/lib/sla";
import { ProgressBar, stageCaption } from "@/components/Progress";

/** Short hall name for chips: "Glenn Residence Hall" → "Glenn". */
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
    room && hall ? { value: "room", label: "My room", detail: room.label } : null,
    hall ? { value: "hall", label: `${hallShort(hall.name)} shared areas`, detail: "Halls, baths, laundry" } : null,
    { value: "campus", label: "Somewhere on campus", detail: "Classrooms, library, dining, gym" },
  ].filter(Boolean) as { value: string; label: string; detail: string }[];

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 md:pt-14">
      <section aria-labelledby="hero-title" className="max-w-3xl">
        <p className="text-sm text-ink-3">
          <span className="font-semibold text-ink-2">{viewer.name}</span>
          {hall ? ` · ${hall.name}${room ? `, ${room.label}` : ""}` : " · Lives off campus"}
        </p>
        <h1 id="hero-title" className="h-hero mt-1">
          What needs fixing?
        </h1>

        <form action="/report" method="get" className="mt-6 rounded-[8px] border border-[#b9c1cc] bg-surface transition-colors focus-within:border-navy focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--navy)_15%,transparent)]">
          <label htmlFor="home-desc" className="sr-only">
            Describe the problem
          </label>
          <textarea
            id="home-desc"
            name="desc"
            rows={3}
            maxLength={2000}
            placeholder="The shower in the 2nd floor bathroom has no hot water…"
            className="block w-full resize-none rounded-t-[12px] bg-transparent px-5 pb-2 pt-4 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:text-[#737f8f] focus-visible:shadow-none"
          />
          <div className="flex flex-col gap-3 border-t border-line px-3 py-3 sm:flex-row sm:items-center">
            <fieldset className="min-w-0 flex-1">
              <legend className="sr-only">Where is it?</legend>
              <div className="flex flex-wrap gap-1.5">
                {places.map((p, i) => (
                  <label
                    key={p.value}
                    className="relative flex cursor-pointer items-center rounded-full px-3.5 py-2 text-sm font-bold text-ink-2 ring-1 ring-inset ring-line-2 transition-colors hover:bg-surface-2 has-[:checked]:bg-navy has-[:checked]:text-white has-[:checked]:ring-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy"
                  >
                    <input type="radio" name="where" value={p.value} defaultChecked={i === 0} className="sr-only" />
                    {p.label}
                    <span className="sr-only">: {p.detail}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="btn btn-accent shrink-0">
              Continue <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </form>
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
          <QrCode aria-hidden className="size-4 shrink-0" />
          Spotted a Ramblin’ Repairs sticker on a door or machine? Scan it to skip straight to the form.
        </p>
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <section aria-labelledby="mine-title" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="mine-title" className="h-section text-[1.25rem]">
              Your reports
            </h2>
            <Link href="/tickets" className="text-sm font-bold text-navy hover:underline">
              See all
            </Link>
          </div>
          {active.length ? (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {active.map((t) => {
                const update = latestFor(t.id);
                const needsYou = t.status === "RESOLVED" && t.reporterId === viewer.id;
                return (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="card group block p-4 transition-colors hover:border-line-2 hover:shadow-[var(--shadow-sm)] md:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="font-bold leading-snug text-ink group-hover:text-navy">{t.summary}</h3>
                        <span className="num shrink-0 pt-0.5 text-xs text-ink-3">{formatTicketNumber(t.number)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-3">{[t.building.name, t.space?.label, t.asset?.name].filter(Boolean).join(" · ")}</p>
                      <div className="mt-4">
                        <ProgressBar status={t.status} />
                      </div>
                      <p className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                        <span className={`font-bold ${needsYou ? "text-resolved" : t.status === "REOPENED" ? "text-[var(--st-reopened)]" : "text-ink"}`}>
                          {needsYou ? "Fixed? Tap to confirm" : stageCaption(t.status)}
                        </span>
                        <span className="text-ink-3">Updated {relativeTime(t.updatedAt, now)}</span>
                      </p>
                      {update && (
                        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
                          <span className="font-bold text-ink">
                            {update.who ? `${shortName(update.who.name)}, ${DEPARTMENT_LABEL[update.who.department as Department] ?? "Staff"}` : "Ramblin’ Repairs"}:
                          </span>{" "}
                          “{update.text}”
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[10px] border border-dashed border-line-2 px-6 py-10 text-center">
              <p className="font-bold text-ink">Nothing in progress</p>
              <p className="mt-1 text-sm text-ink-3">Problems you report or follow show up here, with every update.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="trending-title">
          <h2 id="trending-title" className="h-section text-[1.25rem]">
            Most reported near you
          </h2>
          <p className="mt-1 text-sm text-ink-3">Same problem? Add a “me too” instead of a new report.</p>
          {trending.length ? (
            <ol className="mt-3 divide-y divide-line border-y border-line">
              {trending.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.id}`} className="group flex gap-3.5 py-3">
                    <span className="flex w-11 shrink-0 flex-col items-center rounded-[8px] bg-surface py-1.5 ring-1 ring-inset ring-line">
                      <span className="text-[1.0625rem] font-bold leading-tight text-ink">{t.meTooCount + 1}</span>
                      <span className="text-[0.6875rem] leading-tight text-ink-3">people</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold leading-snug text-ink group-hover:text-navy">{t.summary}</span>
                      <span className="mt-0.5 block truncate text-sm text-ink-3">{t.building.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-3">Nothing popular right now.</p>
          )}
          <Link href="/map" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy hover:underline">
            See everything on the map <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      </div>

      <p className="mt-16 border-t border-line pt-5 text-sm text-ink-3">
        Trying the demo?{" "}
        <Link href="/demo" className="font-bold text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-navy hover:decoration-navy">
          Switch user or fast-forward the clock
        </Link>
      </p>
    </div>
  );
}
