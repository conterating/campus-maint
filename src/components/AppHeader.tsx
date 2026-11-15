import Link from "next/link";
import { Bell, Clock } from "lucide-react";
import { DEPARTMENT_LABEL, ROLE_LABEL, type Department } from "@/lib/domain";
import { can, type Viewer } from "@/lib/visibility";
import { formatDuration } from "@/lib/sla";
import { TopNav } from "./NavLinks";
import { AccountMenu, type AccountLink } from "./AccountMenu";

export function roleLine(v: Viewer): string {
  if (v.role === "ADMIN") return "Administrator";
  if (v.role === "STAFF") return `${DEPARTMENT_LABEL[v.department as Department] ?? "Staff"}${v.isSupervisor ? " · Supervisor" : ""}`;
  if (v.role === "CONTRACTOR") return "Contractor";
  return "Student";
}

/** Where "Current tickets" goes for each role. */
const CURRENT_TICKETS: Record<Viewer["role"], string> = { STUDENT: "/my-tickets", CONTRACTOR: "/jobs", STAFF: "/staff", ADMIN: "/staff" };

function accountLinks(v: Viewer, demoMode: boolean, realRole: string): AccountLink[] {
  const links: AccountLink[] = [
    { href: "/account", label: "View profile" },
    { href: CURRENT_TICKETS[v.role], label: "Current tickets" },
    { href: "/account/security", label: "Password & security" },
  ];
  if (can(v, "canManageUsers") || can(v, "canVerifyResidence")) links.push({ href: "/admin/users", label: "People & residences" });
  if (can(v, "canManageContractors")) links.push({ href: "/admin/contractors", label: "Contractors" });
  if (v.role === "ADMIN") links.push({ href: "/admin/audit", label: "Audit log" });
  if (demoMode && realRole === "ADMIN") links.push({ href: "/demo", label: "Demo controls" });
  return links;
}

export { LogoMark } from "./LogoMark";
import { LogoMark } from "./LogoMark";

export function AppHeader({
  viewer,
  displayName,
  unread,
  clockOffsetMs,
  demoMode,
  realRole,
}: {
  viewer: Viewer;
  displayName: string;
  unread: number;
  clockOffsetMs: number;
  demoMode: boolean;
  realRole: string;
}) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg pr-1">
          <LogoMark />
          <span className="font-display text-[1.125rem] font-extrabold tracking-[-0.015em] text-navy">
            Ramblin’<span className="ml-1 text-gold-ink">Repairs</span>
          </span>
          <span className="sr-only"> home</span>
        </Link>

        <div className="ml-4 hidden flex-1 md:block">
          <TopNav role={viewer.role} />
        </div>
        <div className="flex-1 md:hidden" />

        {clockOffsetMs > 0 && demoMode && (
          <Link
            href="/demo"
            className="hidden items-center gap-1.5 rounded-full bg-buzz-50 px-2.5 py-1 text-xs font-bold text-gold-ink ring-1 ring-buzz/50 sm:flex"
            title="The demo clock is running ahead of real time"
          >
            <Clock aria-hidden className="size-3.5" />
            <span className="num">
              <span className="sr-only">Demo clock is </span>+{formatDuration(clockOffsetMs)}
              <span className="sr-only"> ahead</span>
            </span>
          </Link>
        )}

        <Link
          href="/notifications"
          className="relative grid size-10 place-items-center rounded-full text-ink-2 hover:bg-bg hover:text-ink"
        >
          <Bell aria-hidden className="size-[1.2rem]" />
          <span className="sr-only">{unread ? `Alerts, ${unread} unread` : "Alerts"}</span>
          {unread > 0 && (
            <span aria-hidden className="num absolute right-0.5 top-0.5 grid min-w-[1.15rem] place-items-center rounded-full bg-emergency px-1 text-[0.65rem] font-bold leading-[1.15rem] text-white ring-2 ring-surface">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <AccountMenu
          name={displayName}
          hue={hueFor(viewer.id)}
          roleLabel={ROLE_LABEL[viewer.role]}
          detail={roleLine(viewer)}
          links={accountLinks(viewer, demoMode, realRole)}
        />
      </div>
    </header>
  );
}

/** Stable avatar hue from a user id (avoids a DB round trip in the header). */
export function hueFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
