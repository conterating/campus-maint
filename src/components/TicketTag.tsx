import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatTicketNumber, isOpenStatus } from "@/lib/domain";
import { CategoryIcon, StatusPill, SeverityText } from "./badges";
import { Countdown } from "./Countdown";
import { relativeTime } from "@/lib/format";

export type TagTicket = {
  id: string;
  number: number;
  summary: string;
  category: string;
  severity: string;
  status: string;
  meTooCount: number;
  createdAt: Date;
  responseDueAt: Date;
  firstResponseAt: Date | null;
  escalatedAt: Date | null;
  building: { name: string };
  space?: { label: string } | null;
  asset?: { name: string } | null;
  photoUrl?: string | null;
};

/** Left-hand thumbnail: the reporter's photo when there is one, otherwise the category icon. */
export function TicketThumb({ ticket }: { ticket: Pick<TagTicket, "category" | "photoUrl"> }) {
  if (ticket.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user upload served by our route
    return <img src={ticket.photoUrl} alt="" className="size-10 shrink-0 rounded-[7px] object-cover ring-1 ring-line" />;
  }
  return <CategoryIcon category={ticket.category} />;
}

/** Status for dense lists: the same chip used everywhere. */
export function StatusText({ status }: { status: string }) {
  return <StatusPill status={status} size="sm" />;
}

/**
 * One ticket as a list row. Render inside <ul className="list-group">.
 * The whole row is a single link whose name starts with the summary.
 * `showDue` adds the response countdown, which matters to staff, not reporters.
 */
export function TicketRow({ ticket, now, headingLevel = 3, showDue = false }: { ticket: TagTicket; now: Date; headingLevel?: 2 | 3; showDue?: boolean }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const where = [ticket.building.name, ticket.space?.label, ticket.asset?.name].filter(Boolean).join(" · ");
  const open = isOpenStatus(ticket.status);
  const loud = ticket.severity === "EMERGENCY" || ticket.severity === "URGENT";
  const countdown = showDue && open && (
    <Countdown
      compact
      dueAt={ticket.responseDueAt.toISOString()}
      serverNow={now.toISOString()}
      respondedAt={ticket.firstResponseAt?.toISOString() ?? null}
      closed={!open}
      escalated={!!ticket.escalatedAt}
    />
  );
  return (
    <Link href={`/tickets/${ticket.id}`} className="group flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 md:px-5">
      <TicketThumb ticket={ticket} />
      <div className="min-w-0 flex-1">
        <H className="font-semibold leading-snug text-ink group-hover:text-navy">{ticket.summary}</H>
        <p className="mt-0.5 truncate text-sm text-ink-3">
          <span className="num">{formatTicketNumber(ticket.number)}</span> · {where}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-ink-3">
          <StatusText status={ticket.status} />
          {(loud || showDue) && <SeverityText severity={ticket.severity} />}
          {ticket.meTooCount > 0 && <span className="text-ink-2">{ticket.meTooCount + 1} affected</span>}
          <span>{relativeTime(ticket.createdAt, now)}</span>
          {countdown && <span className="sm:hidden">{countdown}</span>}
        </p>
      </div>
      {countdown && <div className="hidden shrink-0 self-center sm:block">{countdown}</div>}
      <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-line-2 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-3" />
    </Link>
  );
}

/** A list of ticket rows in one grouped container. */
export function TicketList({ tickets, now, headingLevel = 3, bare = false, showDue = false }: { tickets: TagTicket[]; now: Date; headingLevel?: 2 | 3; bare?: boolean; showDue?: boolean }) {
  return (
    <ul className={bare ? "divide-y divide-line" : "list-group"}>
      {tickets.map((t) => (
        <li key={t.id}>
          <TicketRow ticket={t} now={now} headingLevel={headingLevel} showDue={showDue} />
        </li>
      ))}
    </ul>
  );
}
