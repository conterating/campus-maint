import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CheckCircle2, ChevronLeft, Eye, Lock, MapPin, ShieldAlert, Sparkles, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { getTicketDetail, shortName } from "@/lib/tickets";
import { isStaff } from "@/lib/visibility";
import { CATEGORY_LABEL, DEPARTMENT_LABEL, SEVERITY_LABEL, formatTicketNumber, isOpenStatus, type Category, type Department, type Severity } from "@/lib/domain";
import { APP_CONFIG } from "@/config/app";
import { formatDateTime } from "@/lib/format";
import { CategoryChip, SeverityBadge, StatusPill } from "@/components/badges";
import { Countdown } from "@/components/Countdown";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { Timeline } from "@/components/Timeline";
import { Progress, stageCaption, stageStamps } from "@/components/Progress";
import { Avatar } from "@/components/Avatar";
import { hueFor } from "@/components/AppHeader";
import { StudentActions } from "./StudentActions";
import { StaffPanel } from "./StaffPanel";

type Params = Promise<{ id: string }>;
type Search = Promise<{ created?: string; metoo?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const t = await prisma.ticket.findUnique({ where: { id }, select: { number: true } });
  return { title: t ? formatTicketNumber(t.number) : "Ticket" };
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-3 py-2.5">
      <dt className="text-[0.8125rem] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
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
  const where = [t.building.name, t.space?.label ?? t.roomText, t.asset?.name].filter(Boolean).join(" · ");

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
    actorLabel: actorLabel(e.actor),
  }));

  const scopeNote =
    t.scope === "ROOM"
      ? { Icon: Lock, text: "Private to the residents of this room and staff." }
      : t.scope === "DORM"
        ? { Icon: Building2, text: `Visible to ${t.building.name} residents and staff.` }
        : { Icon: Eye, text: "Public: anyone on campus can see and follow this." };

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
    <div className="card p-4 text-sm">
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
      watchers={t._count.followers + (t.ownerUserId && !t.viewerFollows ? 1 : 0)}
    />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 md:pt-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link href={staff ? "/staff" : "/tickets"} className="inline-flex items-center gap-1 rounded-md font-bold text-ink-2 hover:text-navy">
          <ChevronLeft aria-hidden className="size-4" /> {staff ? "Back to queue" : "My reports"}
        </Link>
        <span aria-hidden className="text-line-2">
          /
        </span>
        <span className="num text-ink-3" aria-current="page">
          {formatTicketNumber(t.number)}
        </span>
      </nav>

      {flags.created && (
        <p role="status" className="rise mt-4 flex items-center gap-2.5 rounded-[12px] bg-[#ecfdf3] px-4 py-3 text-sm text-ink ring-1 ring-inset ring-resolved/20">
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-resolved" />
          <span>
            <span className="font-bold">Filed as {formatTicketNumber(t.number)}</span> and sent to {dept}. You&apos;ll get an alert every time it changes.
          </span>
        </p>
      )}
      {flags.metoo && (
        <p role="status" className="rise mt-4 flex items-center gap-2.5 rounded-[12px] bg-navy-50 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-navy-100">
          <Users aria-hidden className="size-5 shrink-0 text-navy" />
          <span>
            <span className="font-bold">You&apos;re counted.</span> {t.meTooCount + 1} people now report this, and you&apos;re following it for updates.
          </span>
        </p>
      )}

      {t.severity === "EMERGENCY" && open && (
        <div className="mt-4">
          <EmergencyBanner police={APP_CONFIG.campusPolice} compact />
        </div>
      )}

      {/* One actions panel, placed by the grid: after the header on phones, a sticky sidebar on desktop. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr] lg:gap-x-8">
        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={t.severity} />
              <CategoryChip category={t.category} />
              {t.escalatedAt && open && (
                <span className="pill bg-emergency text-white">
                  <ShieldAlert aria-hidden className="size-3.5" />
                  Escalated
                </span>
              )}
            </div>
            <h1 className="mt-3 text-[1.625rem] font-extrabold leading-[1.15] tracking-[-0.025em] text-ink md:text-[2.125rem]">{t.summary}</h1>
            <p className="mt-2 flex items-start gap-1.5 text-ink-2">
              <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-ink-3" />
              {where}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Countdown dueAt={t.responseDueAt.toISOString()} serverNow={now.toISOString()} respondedAt={t.firstResponseAt?.toISOString() ?? null} closed={!open} escalated={!!t.escalatedAt} />
              {t.meTooCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-2">
                  <Users aria-hidden className="size-4" />
                  <span>{t.meTooCount + 1} people affected</span>
                </span>
              )}
            </div>
          </header>

          <section aria-labelledby="progress-title" className="card p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="progress-title" className="h-section">
                {stageCaption(t.status)}
              </h2>
              {t.assignee && open && <p className="text-sm text-ink-3">Technician: {shortName(t.assignee.name)}</p>}
            </div>
            <Progress status={t.status} stamps={stageStamps(t.createdAt, t.events)} />
            {t.status === "REOPENED" && <p className="mt-4 text-sm font-bold text-[var(--st-reopened)]">Reopened by the reporter. It&apos;s back in the queue with a fresh response target.</p>}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" aria-label="Actions">
          {actions}

          <section aria-labelledby="details-title" className="card px-4 py-1.5">
            <h2 id="details-title" className="sr-only">
              Details
            </h2>
            <dl className="divide-y divide-line">
              <Prop label="Status">
                <StatusPill status={t.status} size="sm" />
              </Prop>
              <Prop label="Handled by">
                <span className="font-bold">{dept}</span>
                {t.assignee && (
                  <span className="mt-1 flex items-center gap-1.5 text-ink-2">
                    <Avatar name={t.assignee.name} hue={hueFor(t.assignee.id)} size="xs" /> {shortName(t.assignee.name)}
                  </span>
                )}
              </Prop>
              <Prop label="Owner">
                <span className="font-bold">
                  {t.ownerType === "STUDENT" ? (isOwner ? "You (it's in your room)" : `Room resident${staff && t.ownerUser ? ` (${shortName(t.ownerUser.name)})` : ""}`) : dept}
                </span>
              </Prop>
              <Prop label="Reported">
                {formatDateTime(t.createdAt)}
                {isReporter ? " by you" : staff ? ` by ${shortName(t.reporter.name)}` : ""}
              </Prop>
              <Prop label="Respond by">
                {formatDateTime(t.responseDueAt)}
              </Prop>
              <Prop label="Visibility">
                <span className="flex items-start gap-1.5 text-ink-2">
                  <scopeNote.Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  {scopeNote.text}
                </span>
              </Prop>
            </dl>
          </section>
        </aside>

        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="report-title" className="card overflow-hidden">
            {t.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- user upload served by our route
              <img src={t.photoUrl} alt={`Photo of the problem: ${t.summary}`} className="max-h-[26rem] w-full bg-bg object-contain" />
            )}
            <div className="p-5">
              <h2 id="report-title" className="h-section">
                What was reported
              </h2>
              <p className="mt-2 whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink">{t.description}</p>
              <div className="mt-5 flex gap-2.5 border-t border-line pt-4 text-sm text-ink-3">
                <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
                <p>
                  {t.aiSource === "claude" ? "Claude" : "The routing rules"} sorted this as <strong className="text-ink-2">{CATEGORY_LABEL[t.aiCategory as Category]}</strong>,{" "}
                  <strong className="text-ink-2">{SEVERITY_LABEL[t.aiSeverity as Severity]}</strong>, for <strong className="text-ink-2">{DEPARTMENT_LABEL[t.aiDepartment as Department]}</strong>.
                  {corrected && <> It was later changed; the activity below shows who changed what.</>}
                  {staff && t.aiRationale && <span className="mt-1 block text-ink-3">{t.aiRationale}</span>}
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="timeline-title" className="card p-5">
            <h2 id="timeline-title" className="h-section">
              Activity
            </h2>
            <div className="mt-4">
              <Timeline events={events} now={now} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
