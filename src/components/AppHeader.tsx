import Link from "next/link";
import { Bell, Clock } from "lucide-react";
import { DEPARTMENT_LABEL, type Department } from "@/lib/domain";
import type { Viewer } from "@/lib/visibility";
import { formatDuration } from "@/lib/sla";
import { TopNav } from "./NavLinks";
import { Avatar } from "./Avatar";

export function roleLine(v: Viewer): string {
  if (v.role === "ADMIN") return "Administrator";
  if (v.role === "STAFF") return `${DEPARTMENT_LABEL[v.department as Department] ?? "Staff"}${v.isSupervisor ? ", supervisor" : ""}`;
  return "Student";
}

/** The mark: a work-order tag with a check on it, i.e. "reported, and getting fixed". */
export function LogoMark({ className = "size-8", onNavy = false }: { className?: string; onNavy?: boolean }) {
  const body = onNavy ? "#eaaa00" : "#003057";
  const ink = onNavy ? "#003057" : "#eaaa00";
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <path d="M11 4h17a2.5 2.5 0 0 1 2.5 2.5v19A2.5 2.5 0 0 1 28 28H11L2.5 16z" fill={body} />
      <circle cx="9" cy="16" r="2.2" fill={onNavy ? "#003057" : "#fff"} />
      <path d="M14.5 16.5l3.6 3.6L26 11.5" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="square" />
    </svg>
  );
}

export function AppHeader({ viewer, unread, clockOffsetMs }: { viewer: Viewer; unread: number; clockOffsetMs: number }) {
  return (
    <header className="no-print sticky top-0 z-40 border-b-[3px] border-buzz bg-navy text-white">
      <div className="mx-auto flex h-[61px] max-w-6xl items-center gap-2 px-4 md:gap-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5 pr-1">
          <LogoMark onNavy className="size-8" />
          <span className="font-display text-[1.5rem] font-extrabold uppercase leading-none tracking-[0.01em]">
            Ramblin’<span className="ml-1.5 text-buzz">Repairs</span>
          </span>
          <span className="sr-only"> home</span>
        </Link>

        <div className="ml-6 hidden flex-1 self-stretch md:block">
          <TopNav role={viewer.role} />
        </div>
        <div className="flex-1 md:hidden" />

        {clockOffsetMs > 0 && (
          <Link href="/demo" className="hidden items-center gap-1.5 rounded-[3px] bg-buzz px-2 py-1 text-navy sm:flex" title="The demo clock is running ahead of real time">
            <Clock aria-hidden className="size-3.5" />
            <span className="num text-[0.9375rem]">
              <span className="sr-only">Demo clock is </span>+{formatDuration(clockOffsetMs)}
              <span className="sr-only"> ahead</span>
            </span>
          </Link>
        )}

        <Link href="/notifications" className="relative grid size-11 place-items-center rounded-[4px] text-white/85 transition-colors hover:bg-white/10 hover:text-white">
          <Bell aria-hidden className="size-[1.25rem]" />
          <span className="sr-only">{unread ? `Alerts, ${unread} unread` : "Alerts"}</span>
          {unread > 0 && (
            <span aria-hidden className="num absolute right-0.5 top-0.5 grid min-w-[1.25rem] place-items-center rounded-full bg-buzz px-1 text-[0.75rem] leading-[1.25rem] text-navy ring-2 ring-navy">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <Link href="/demo" className="flex items-center gap-2.5 rounded-[4px] py-1 pl-1 pr-1 transition-colors hover:bg-white/10 lg:pr-2.5" title="Switch user (demo)">
          <span className="rounded-full ring-2 ring-buzz/70">
            <Avatar name={viewer.name} hue={hueFor(viewer.id)} size="sm" />
          </span>
          <span className="sr-only">Switch user. Viewing as </span>
          <span className="hidden flex-col text-left leading-tight lg:flex">
            <span className="text-[0.9375rem] font-bold text-white">{viewer.name}</span>
            <span className="text-[0.8125rem] text-white/75">{roleLine(viewer)}</span>
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
