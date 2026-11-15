"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, ClipboardList, Home, ListChecks, LogIn, Map, Plus, QrCode, UserRound, Wrench } from "lucide-react";
import { isActive, navItemsFor, type NavItem, type NavRole } from "./navItems";

const ICONS = { home: Home, map: Map, plus: Plus, list: ListChecks, bell: Bell, queue: ClipboardList, chart: BarChart3, qr: QrCode, wrench: Wrench, user: UserRound, login: LogIn };

export function TopNav({ role }: { role: NavRole }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  const report = items.find((i) => i.icon === "plus");
  return (
    <nav aria-label="Main" className="flex h-full items-stretch justify-between gap-4">
      <ul className="flex items-stretch gap-5">
        {items
          // Report and Sign in render as buttons on the right, not as tabs.
          .filter((i) => i.icon !== "plus" && i.icon !== "login")
          .map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center text-[0.9375rem] font-bold transition-colors after:absolute after:inset-x-0 after:-bottom-[3px] after:h-[3px] after:origin-left after:transition-transform after:duration-200 ${
                    active ? "text-white after:scale-x-100 after:bg-white" : "text-white/75 after:scale-x-0 after:bg-white/60 hover:text-white hover:after:scale-x-100"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
      {report && (
        <Link href={report.href} aria-current={isActive(pathname, report.href) ? "page" : undefined} className="btn btn-accent btn-sm self-center">
          <Plus aria-hidden className="size-4" strokeWidth={2.75} />
          Report a problem
        </Link>
      )}
    </nav>
  );
}

/** Signed-out header: "Sign in" as a button beside "Create account" (desktop; phones use the bottom tab). */
export function HeaderSignIn() {
  const pathname = usePathname();
  return (
    <Link
      href="/login"
      aria-current={isActive(pathname, "/login") ? "page" : undefined}
      className="btn btn-sm hidden border-white/50 text-white hover:bg-white/10 aria-[current=page]:border-white aria-[current=page]:bg-white/10 md:inline-flex"
    >
      <LogIn aria-hidden className="size-4" />
      Sign in
    </Link>
  );
}

export function BottomNav({ role, unread }: { role: NavRole; unread: number }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t-2 border-navy bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <BottomItem key={item.href} item={item} active={isActive(pathname, item.href)} badge={item.icon === "bell" ? unread : 0} />
        ))}
      </ul>
    </nav>
  );
}

function BottomItem({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  const Icon = ICONS[item.icon];
  if (item.icon === "plus") {
    return (
      <li className="flex justify-center">
        <Link href={item.href} aria-current={active ? "page" : undefined} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-bold text-ink">
          <span className="-mt-5 grid size-12 place-items-center rounded-[6px] border-2 border-navy bg-buzz text-navy-hover transition-transform active:scale-95">
            <Icon aria-hidden className="size-5" strokeWidth={2.75} />
          </span>
          {item.label}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.75rem] font-bold before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:origin-center before:bg-navy before:transition-transform before:duration-200 ${active ? "text-navy before:scale-x-100" : "text-ink-3 before:scale-x-0"}`}
      >
        <span className="grid h-7 w-12 place-items-center">
          <Icon aria-hidden className="size-[1.3rem]" strokeWidth={active ? 2.4 : 2} />
        </span>
        {item.label}
        {badge > 0 && (
          <span className="num absolute left-1/2 top-1.5 ml-2 grid min-w-[1.2rem] place-items-center rounded-full bg-navy px-1 text-[0.75rem] leading-[1.2rem] text-buzz ring-2 ring-bg">
            {badge > 9 ? "9+" : badge}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </Link>
    </li>
  );
}
