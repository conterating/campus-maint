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

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <span aria-hidden className={`${className} relative grid shrink-0 place-items-center rounded-[9px] bg-navy text-buzz shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)]`}>
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.9 1.9 0 1 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.3-.3-2.4z" />
      </svg>
    </span>
  );
}

export function AppHeader({ viewer, unread, clockOffsetMs }: { viewer: Viewer; unread: number; clockOffsetMs: number }) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg pr-1">
          <LogoMark />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-[-0.02em] text-ink">
            FixIt <span className="text-navy">GT</span>
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
          aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        >
          <Bell aria-hidden className="size-[1.2rem]" />
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
