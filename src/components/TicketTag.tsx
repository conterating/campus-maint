import Link from "next/link";
import { formatTicketNumber, isOpenStatus } from "@/lib/domain";
import { CategoryIcon, StatusPill, SeverityText } from "./badges";
import { Countdown } from "./Countdown";
import { relativeTime } from "@/lib/format";
import { placeParts } from "./WorkOrder";

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
 * One ticket as a list row with real columns: the number in the stamp face,
 * the title over its location, and the status word in its color. Urgency and
 * the response clock appear only when they matter. Render inside a <ul>.
 */
export function TicketRow({
  ticket,
  now,
  headingLevel = 3,
  showDue = false,
  time,
  timeLabel,
  note,
  statusText,
}: {
  ticket: TagTicket;
  now: Date;
  headingLevel?: 2 | 3;
  showDue?: boolean;
  /** Which time to show (defaults to when it was reported). */
  time?: Date;
  timeLabel?: string;
  /** Extra line under the title, e.g. the latest staff update. */
  note?: React.ReactNode;
  /** Override the status word, e.g. "Fixed? Confirm it". */
  statusText?: React.ReactNode;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const place = placeParts(ticket.building.name, ticket.space?.label, ticket.asset?.name);
  const open = isOpenStatus(ticket.status);
  const loud = open && (ticket.severity === "EMERGENCY" || ticket.severity === "URGENT");
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
  const when = time ?? ticket.createdAt;
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 py-4 transition-colors hover:bg-surface-2 @xl:grid-cols-[6.5rem_minmax(0,1fr)_12rem] @xl:items-start @xl:px-2"
    >
      <span className="num order-2 text-right text-[1.25rem] leading-tight text-navy @xl:order-1 @xl:text-left">{formatTicketNumber(ticket.number)}</span>
      <div className="order-1 min-w-0 @xl:order-2">
        <H className="text-[1.0625rem] font-bold leading-snug text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">{ticket.summary}</H>
        <p className="mt-0.5 text-[0.9375rem] leading-snug text-ink-3">
          {place.building}
          {place.spot && <span className="text-ink-2">, {place.spot}</span>}
        </p>
        {note}
      </div>
      <div className="order-3 col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 @xl:col-span-1 @xl:flex-col @xl:items-end @xl:gap-1 @xl:text-right">
        {statusText ?? <StatusText status={ticket.status} />}
        <span className="flex items-center gap-3 text-[0.9375rem] text-ink-3">
          {loud && <SeverityText severity={ticket.severity} />}
          {ticket.meTooCount > 0 && <span className="num text-[1rem]">{ticket.meTooCount + 1} affected</span>}
        </span>
        {countdown ? (
          countdown
        ) : (
          <span className="num text-[0.9375rem] font-semibold text-ink-3">
            {timeLabel ? `${timeLabel} ` : ""}
            {relativeTime(when, now)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** A list of ticket rows in one grouped container. */
export function TicketList({ tickets, now, headingLevel = 3, bare = false, showDue = false }: { tickets: TagTicket[]; now: Date; headingLevel?: 2 | 3; bare?: boolean; showDue?: boolean }) {
  return (
    <ul className={`@container stagger ${bare ? "divide-y divide-line" : "list-group"}`}>
      {tickets.map((t) => (
        <li key={t.id}>
          <TicketRow ticket={t} now={now} headingLevel={headingLevel} showDue={showDue} />
        </li>
      ))}
    </ul>
  );
}
