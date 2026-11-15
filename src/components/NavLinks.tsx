"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, ClipboardList, Home, ListChecks, Map, Plus, QrCode } from "lucide-react";
import type { Role } from "@/lib/domain";
import { isActive, navItemsFor, type NavItem } from "./navItems";

const ICONS = { home: Home, map: Map, plus: Plus, list: ListChecks, bell: Bell, queue: ClipboardList, chart: BarChart3, qr: QrCode };

export function TopNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  const report = items.find((i) => i.icon === "plus")!;
  return (
    <nav aria-label="Main" className="flex items-center justify-between gap-4">
      <ul className="flex items-center gap-0.5">
        {items
          .filter((i) => i.icon !== "plus")
          .map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${active ? "bg-navy-50 text-navy" : "text-ink-2 hover:bg-bg hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
      <Link href={report.href} aria-current={isActive(pathname, report.href) ? "page" : undefined} className="btn btn-accent btn-sm">
        <Plus aria-hidden className="size-4" strokeWidth={2.75} />
        Report a problem
      </Link>
    </nav>
  );
}

export function BottomNav({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="grid grid-cols-5">
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
          <span className="grid size-10 place-items-center rounded-[12px] bg-buzz text-navy-hover shadow-[0_2px_6px_rgb(181_130_0/0.35)]">
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
        className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-bold ${active ? "text-navy" : "text-ink-3"}`}
      >
        <span className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${active ? "bg-navy-50" : ""}`}>
          <Icon aria-hidden className="size-[1.3rem]" strokeWidth={active ? 2.4 : 2} />
        </span>
        {item.label}
        {badge > 0 && (
          <span className="num absolute left-1/2 top-1.5 ml-2 grid min-w-[1.1rem] place-items-center rounded-full bg-emergency px-1 text-[0.625rem] leading-[1.1rem] text-white ring-2 ring-surface">
            {badge > 9 ? "9+" : badge}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </Link>
    </li>
  );
}
