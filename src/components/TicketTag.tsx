import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { STATUS_LABEL, formatTicketNumber, isOpenStatus, type Status } from "@/lib/domain";
import { STATUS_COLOR, SeverityText } from "./badges";
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

/** Status as a colored dot and label: quiet enough for dense lists. */
export function StatusText({ status }: { status: string }) {
  const s = (status in STATUS_LABEL ? status : "SUBMITTED") as Status;
  return (
    <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: STATUS_COLOR[s] }}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
      {STATUS_LABEL[s]}
    </span>
  );
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
    <Link href={`/tickets/${ticket.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2 md:px-5">
      <div className="min-w-0 flex-1">
        <H className="font-bold leading-snug text-ink group-hover:text-navy">{ticket.summary}</H>
        <p className="mt-0.5 truncate text-sm text-ink-3">{where}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-3">
          <StatusText status={ticket.status} />
          {loud && (
            <>
              <span aria-hidden>·</span>
              <SeverityText severity={ticket.severity} />
            </>
          )}
          <span aria-hidden>·</span>
          <span>{relativeTime(ticket.createdAt, now)}</span>
          {ticket.meTooCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-ink-2">{ticket.meTooCount + 1} affected</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="num">{formatTicketNumber(ticket.number)}</span>
          {countdown && <span className="sm:hidden">{countdown}</span>}
        </p>
      </div>
      {countdown && <div className="hidden shrink-0 sm:block">{countdown}</div>}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-line-2 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-3" />
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
