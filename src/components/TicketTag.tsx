import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { formatTicketNumber, isOpenStatus } from "@/lib/domain";
import { CategoryIcon, SeverityText, StatusPill } from "./badges";
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
};

/**
 * One ticket as a clean list row. Render inside <ul className="list-group">.
 * The whole row is a single link whose name starts with the summary.
 */
export function TicketRow({ ticket, now, headingLevel = 3 }: { ticket: TagTicket; now: Date; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const where = [ticket.building.name, ticket.space?.label, ticket.asset?.name].filter(Boolean).join(" · ");
  const open = isOpenStatus(ticket.status);
  return (
    <Link href={`/tickets/${ticket.id}`} className="group flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:items-center">
      <CategoryIcon category={ticket.category} />
      <div className="min-w-0 flex-1">
        <H className="font-bold leading-snug text-ink group-hover:text-navy">{ticket.summary}</H>
        <p className="mt-0.5 truncate text-sm text-ink-3">{where}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-ink-3">
          <SeverityText severity={ticket.severity} />
          <span className="num">{formatTicketNumber(ticket.number)}</span>
          <span>{relativeTime(ticket.createdAt, now)}</span>
          {ticket.meTooCount > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-ink-2">
              <Users aria-hidden className="size-3.5" />
              {ticket.meTooCount} me too
            </span>
          )}
          <span className="sm:hidden">
            <StatusPill status={ticket.status} size="sm" />
          </span>
          {open && (
            <span className="sm:hidden">
              <Countdown
                compact
                dueAt={ticket.responseDueAt.toISOString()}
                serverNow={now.toISOString()}
                respondedAt={ticket.firstResponseAt?.toISOString() ?? null}
                closed={!open}
                escalated={!!ticket.escalatedAt}
              />
            </span>
          )}
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <StatusPill status={ticket.status} />
        {open && (
          <Countdown
            compact
            dueAt={ticket.responseDueAt.toISOString()}
            serverNow={now.toISOString()}
            respondedAt={ticket.firstResponseAt?.toISOString() ?? null}
            closed={!open}
            escalated={!!ticket.escalatedAt}
          />
        )}
      </div>
      <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-line-2 group-hover:text-ink-3 sm:mt-0" />
    </Link>
  );
}

/** A list of ticket rows in one grouped container. */
export function TicketList({ tickets, now, headingLevel = 3, bare = false }: { tickets: TagTicket[]; now: Date; headingLevel?: 2 | 3; bare?: boolean }) {
  return (
    <ul className={bare ? "divide-y divide-line" : "list-group"}>
      {tickets.map((t) => (
        <li key={t.id}>
          <TicketRow ticket={t} now={now} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
