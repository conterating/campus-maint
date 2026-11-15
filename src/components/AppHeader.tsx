import Link from "next/link";
import { Bell, Clock } from "lucide-react";
import { DEPARTMENT_LABEL, type Department } from "@/lib/domain";
import type { Viewer } from "@/lib/visibility";
import { formatDuration } from "@/lib/sla";
import { TopNav } from "./NavLinks";
import { Avatar } from "./Avatar";

export function roleLine(v: Viewer): string {
  if (v.role === "ADMIN") return "Administrator";
  if (v.role === "STAFF") return `${DEPARTMENT_LABEL[v.department as Department] ?? "Staff"}${v.isSupervisor ? " · Supervisor" : ""}`;
  return "Student";
}

/** The mark: a navy roundel with a gold check, i.e. "reported, and getting fixed". */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="9" fill="#003057" />
      <path d="M9 16.5l4.6 4.6L23.5 11" fill="none" stroke="#eaaa00" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppHeader({ viewer, unread, clockOffsetMs }: { viewer: Viewer; unread: number; clockOffsetMs: number }) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg pr-1">
          <LogoMark />
          <span className="text-[1.125rem] font-extrabold tracking-[-0.03em] text-navy">
            Ramblin’<span className="ml-1 text-gold-ink">Repairs</span>
          </span>
          <span className="sr-only"> home</span>
        </Link>

        <div className="ml-4 hidden flex-1 md:block">
          <TopNav role={viewer.role} />
        </div>
        <div className="flex-1 md:hidden" />

        {clockOffsetMs > 0 && (
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

        <Link href="/demo" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 hover:bg-bg lg:pr-3" title="Switch user (demo)">
          <Avatar name={viewer.name} hue={hueFor(viewer.id)} size="sm" />
          <span className="sr-only">Switch user. Viewing as </span>
          <span className="hidden flex-col text-left leading-tight lg:flex">
            <span className="text-sm font-bold text-ink">{viewer.name}</span>
            <span className="text-xs text-ink-3">{roleLine(viewer)}</span>
          </span>
          <span className="sr-only lg:hidden">{viewer.name}</span>
        </Link>
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
