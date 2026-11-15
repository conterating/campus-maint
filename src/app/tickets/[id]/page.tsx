import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ChevronLeft, Eye, Lock, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { getTicketDetail, shortName } from "@/lib/tickets";
import { isStaff } from "@/lib/visibility";
import { CATEGORY_LABEL, DEPARTMENT_LABEL, SEVERITY_LABEL, formatTicketNumber, isOpenStatus, parseEventPhotos, type Category, type Department, type Severity } from "@/lib/domain";
import { APP_CONFIG } from "@/config/app";
import { formatDateTime } from "@/lib/format";
import { SeverityText } from "@/components/badges";
import { Countdown } from "@/components/Countdown";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { Timeline } from "@/components/Timeline";
import { Progress, stageCaption, stageStamps } from "@/components/Progress";
import { FiledTag, Stamp, WoField, placeParts } from "@/components/WorkOrder";
import { StudentActions } from "./StudentActions";
import { StaffPanel } from "./StaffPanel";
import { CommentForm } from "./CommentForm";

type Params = Promise<{ id: string }>;
type Search = Promise<{ created?: string; metoo?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const t = await prisma.ticket.findUnique({ where: { id }, select: { number: true } });
  return { title: t ? formatTicketNumber(t.number) : "Ticket" };
}

export default async function TicketPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const flags = await searchParams;
  const { viewer, now } = await getContext();
  const t = await getTicketDetail(prisma, viewer, id);
  if (!t) notFound();

  const staff = isStaff(viewer);
  const open = isOpenStatus(t.status);
  const isReporter = t.reporterId === viewer.id;
  const isOwner = t.ownerUserId === viewer.id;
  const dept = DEPARTMENT_LABEL[t.department as Department];
  const place = placeParts(t.building.name, t.space?.label ?? t.roomText, t.asset?.name);
  const number = formatTicketNumber(t.number);

  // Students see other students anonymously; staff names are always shown.
  const actorLabel = (actor: { id: string; name: string; role: string; department: string | null } | null) => {
    if (!actor) return "Ramblin’ Repairs";
    if (actor.id === viewer.id) return "You";
    if (actor.role === "STUDENT") return staff ? shortName(actor.name) : null;
    if (actor.role === "ADMIN") return `${shortName(actor.name)}, Campus Services`;
    return `${shortName(actor.name)}, ${DEPARTMENT_LABEL[actor.department as Department] ?? "Staff"}`;
  };
  const events = t.events.map((e) => ({
    id: e.id,
    type: e.type,
    toStatus: e.toStatus,
    message: e.message,
    internal: e.internal,
    createdAt: e.createdAt,
    // Other students stay anonymous, but a comment still needs an author line.
    actorLabel: actorLabel(e.actor) ?? (e.type === "COMMENT" ? "A student" : null),
    photos: parseEventPhotos(e.photos),
  }));

  const scopeNote =
    t.scope === "ROOM"
      ? { Icon: Lock, text: "Private to the residents of this room and staff." }
      : t.scope === "DORM"
        ? { Icon: Building2, text: `Visible to ${t.building.name} residents and staff.` }
        : { Icon: Eye, text: "Public: anyone on campus can see and follow this." };

  const commentAudience = [
    t.scope === "ROOM"
      ? "Only this room's residents and staff will see it."
      : t.scope === "DORM"
        ? `${t.building.name} residents and staff will see it.`
        : "Anyone on campus who opens this ticket will see it.",
    staff ? "For a note students can't see, use Staff controls." : t.viewerFollows || isOwner ? "" : "You'll follow the ticket so you see replies.",
  ]
    .filter(Boolean)
    .join(" ");

  const staffList = staff
    ? await prisma.user.findMany({ where: { role: "STAFF", department: t.department }, select: { id: true, name: true, isSupervisor: true }, orderBy: { name: "asc" } })
    : [];
  const canAct = staff && (viewer.role === "ADMIN" || viewer.department === t.department);
  const corrected = t.aiCategory !== t.category || t.aiSeverity !== t.severity || t.aiDepartment !== t.department;

  const actions = canAct ? (
    <StaffPanel
      ticket={{ id: t.id, status: t.status, category: t.category, severity: t.severity, summary: t.summary, department: t.department, assigneeId: t.assigneeId }}
      staff={staffList.map((s) => ({ id: s.id, name: s.name, isSupervisor: s.isSupervisor }))}
      viewerId={viewer.id}
    />
  ) : staff ? (
    <div className="border-l-4 border-line-2 pl-4 text-[0.9375rem]">
      <p className="font-bold">This ticket belongs to {dept}.</p>
      <p className="mt-1 text-ink-3">Only that department (or an administrator) can update it.</p>
    </div>
  ) : (
    <StudentActions
      ticketId={t.id}
      status={t.status}
      isReporter={isReporter}
      isOwner={isOwner}
      following={t.viewerFollows}
      meToo={t.viewerMeToo}
      canMeToo={open && !isReporter && t.scope !== "ROOM"}
      affected={t.meTooCount + 1}
      watchers={t._count.followers + (t.ownerUserId && !t.viewerFollows ? 1 : 0)}
    />
  );

  // "People affected" lives with the Me too control when there is one; otherwise in the header.
  const meTooInRail = !staff && ((open && !isReporter && t.scope !== "ROOM") || t.viewerMeToo);
  const ownerText =
    t.ownerType === "STUDENT" ? (isOwner ? "You (it's in your room)" : `Room resident${staff && t.ownerUser ? ` (${shortName(t.ownerUser.name)})` : ""}`) : null;
  const sortedNote = corrected
    ? `Sorted automatically as ${CATEGORY_LABEL[t.aiCategory as Category]}, ${SEVERITY_LABEL[t.aiSeverity as Severity]}, for ${DEPARTMENT_LABEL[t.aiDepartment as Department]}. It's been changed since; the activity shows how.`
    : `Sorted automatically as ${CATEGORY_LABEL[t.aiCategory as Category]} for ${DEPARTMENT_LABEL[t.aiDepartment as Department]}. Staff fix it if that's off.`;

  return (
    <div className="mx-auto max-w-6xl overflow-x-clip px-4 pb-10 pt-5 md:px-6 md:pt-8">
      <nav aria-label="Breadcrumb" className="text-[0.9375rem]">
        <Link href={staff ? "/staff" : "/tickets"} className="inline-flex items-center gap-1 font-bold text-ink-2 hover:text-navy">
          <ChevronLeft aria-hidden className="size-4" /> {staff ? "Back to queue" : "My reports"}
        </Link>
      </nav>

      {flags.created && (
        <div className="mt-6">
          <FiledTag number={number} category={CATEGORY_LABEL[t.category as Category]} department={dept} />
        </div>
      )}
      {flags.metoo && (
        <p role="status" className="rise mt-6 border-l-4 border-navy pl-4 text-ink">
          <span className="font-bold">You&apos;re counted.</span> {t.meTooCount + 1} people now report this, and you&apos;re following it for updates.
        </p>
      )}

      {t.severity === "EMERGENCY" && open && (
        <div className="mt-6">
          <EmergencyBanner police={APP_CONFIG.campusPolice} compact />
        </div>
      )}

      {/* Phones: header, then actions, then the rest. Desktop: actions ride along in a right rail. */}
      <div className="mt-8 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <header>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              {/* Just filed? The tag above already stamped the number; don't say it twice. */}
              {!flags.created && <Stamp number={number} className="anim-ink -rotate-2" />}
              <div className="flex flex-wrap items-center gap-2 pb-1 sm:justify-end">
                {!flags.created && (
                  <span className="font-display text-[1.25rem] font-bold uppercase leading-none tracking-[0.03em] text-ink-2">{CATEGORY_LABEL[t.category as Category]}</span>
                )}
                {t.escalatedAt && open && (
                  <span className="pill bg-emergency text-white">
                    <ShieldAlert aria-hidden className="size-3.5" />
                    Escalated
                  </span>
                )}
              </div>
            </div>
            <h1 className="mt-6 text-[1.75rem] font-bold leading-[1.15] text-ink md:text-[2.25rem]">{t.summary}</h1>

            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              <WoField label="Location" className="col-span-2 sm:col-span-1">
                <span className="block font-bold leading-snug">{place.building}</span>
                {place.spot && <span className="block leading-snug text-ink-2">{place.spot}</span>}
              </WoField>
              <WoField label="Technician">
                <span className="block font-bold leading-snug">{t.assignee ? shortName(t.assignee.name) : "Not assigned yet"}</span>
                <span className="block leading-snug text-ink-2">{dept}</span>
              </WoField>
              <WoField label="Respond by">
                <span className="num block text-[1.1875rem] leading-snug">{formatDateTime(t.responseDueAt)}</span>
                <span className="mt-0.5 block">
                  <Countdown dueAt={t.responseDueAt.toISOString()} serverNow={now.toISOString()} respondedAt={t.firstResponseAt?.toISOString() ?? null} closed={!open} escalated={!!t.escalatedAt} />
                </span>
              </WoField>
              <WoField label="Priority">
                <span className="block font-bold">
                  <SeverityText severity={t.severity} />
                </span>
                {!meTooInRail && t.meTooCount > 0 && <span className="block text-ink-2">{t.meTooCount + 1} people affected</span>}
              </WoField>
              {ownerText && (
                <WoField label="Owner" className="col-span-2 lg:col-span-4">
                  <span className="font-bold">{ownerText}</span>
                </WoField>
              )}
            </dl>
          </header>

          <section aria-labelledby="progress-title" className="mt-14">
            <div className="rule-head">
              <h2 id="progress-title" className="font-display text-[1.875rem] font-extrabold uppercase leading-none text-navy md:text-[2.25rem]">
                {stageCaption(t.status)}
              </h2>
            </div>
            <div className="mt-7">
              <Progress
                status={t.status}
                stamps={stageStamps(t.createdAt, t.events)}
                notes={[isReporter ? "by you" : staff ? `by ${shortName(t.reporter.name)}` : null, t.assignee ? shortName(t.assignee.name) : null]}
              />
            </div>
            {t.status === "REOPENED" && <p className="mt-6 border-l-4 border-st-reopened pl-4 font-bold text-st-reopened">Reopened by the reporter. It&apos;s back in the queue with a fresh response target.</p>}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" aria-label="Actions">
          {actions}
          <p className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-[0.9375rem] text-ink-3">
            <scopeNote.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {scopeNote.text}
          </p>
        </aside>

        <div className="min-w-0 space-y-14 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="report-title">
            <div className="rule-head">
              <h2 id="report-title" className="h-section">
                What was reported
              </h2>
            </div>
            <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="whitespace-pre-line text-[1.1875rem] leading-relaxed text-ink">{t.description}</p>
                <p className="mt-4 text-[0.9375rem] text-ink-3">
                  {t.aiSource === "claude" ? sortedNote : sortedNote.replace("Sorted automatically", "Sorted by the routing rules")}
                  {staff && t.aiRationale && <span className="mt-1 block">{t.aiRationale}</span>}
                </p>
              </div>
              {t.photoUrl && (
                <a href={t.photoUrl} target="_blank" rel="noopener" className="block self-start">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user upload served by our route */}
                  <img src={t.photoUrl} alt={`Photo of the problem: ${t.summary}`} className="max-h-72 w-full rounded-[4px] object-cover ring-1 ring-line md:w-64" />
                </a>
              )}
            </div>
          </section>

          <section aria-labelledby="timeline-title">
            <div className="rule-head">
              <h2 id="timeline-title" className="h-section">
                Activity
              </h2>
            </div>
            <div className="mt-5">
              <Timeline events={events} now={now} />
            </div>
            <CommentForm ticketId={t.id} audience={commentAudience} />
          </section>
        </div>
      </div>
    </div>
  );
}
