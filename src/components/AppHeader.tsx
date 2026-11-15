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
    <header className="no-print sticky top-0 z-40 border-b-[3px] border-tech-gold bg-navy text-white">
      <div className="mx-auto flex h-[61px] max-w-6xl items-center gap-2 px-4 md:gap-4">
        <Link href="/" className="flex items-center gap-2.5 pr-1">
          <LogoMark onNavy className="size-7" />
          <span className="font-display text-[1.625rem] font-extrabold uppercase leading-none tracking-[0.01em] text-white">
            Ramblin’<span className="ml-1.5 text-tech-gold">Repairs</span>
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
            className="hidden items-center gap-1.5 rounded-[3px] bg-buzz px-2 py-1 text-xs font-bold text-navy sm:flex"
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
          className="relative grid size-10 place-items-center rounded-[5px] text-white/85 hover:bg-white/10 hover:text-white"
        >
          <Bell aria-hidden className="size-[1.2rem]" />
          <span className="sr-only">{unread ? `Alerts, ${unread} unread` : "Alerts"}</span>
          {unread > 0 && (
            <span aria-hidden className="num absolute right-0.5 top-0.5 grid min-w-[1.15rem] place-items-center rounded-full bg-emergency px-1 text-[0.65rem] font-bold leading-[1.15rem] text-white ring-2 ring-navy">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <AccountMenu
          onNavy
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
