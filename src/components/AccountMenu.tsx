"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth-actions";
import { Avatar } from "./Avatar";

export type AccountLink = { href: string; label: string };

/** The signed-in person's name, role badge, and a disclosure with account links and Sign out. */
export function AccountMenu({
  name,
  hue,
  roleLabel,
  detail,
  links,
  onNavy = false,
}: {
  onNavy?: boolean;
  name: string;
  hue: number;
  roleLabel: string;
  detail: string;
  links: AccountLink[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-10 items-center gap-2.5 rounded-[5px] py-1 pl-1 pr-2 lg:pr-3 ${onNavy ? "hover:bg-white/10" : "hover:bg-bg"}`}
      >
        <Avatar name={name} hue={hue} size="sm" />
        <span className="hidden flex-col text-left leading-tight lg:flex">
          <span className={`text-sm font-bold ${onNavy ? "text-white" : "text-ink"}`}>{name}</span>
          <span className={`text-xs ${onNavy ? "text-white/70" : "text-ink-3"}`}>{detail}</span>
        </span>
        <span className="sr-only lg:hidden">{name}, </span>
        <span className="sr-only">account menu</span>
        <ChevronDown aria-hidden className={`size-4 ${onNavy ? "text-white/70" : "text-ink-3"}`} />
      </button>
      {open && (
        <div id={id} className="card absolute right-0 top-12 text-ink z-50 w-64 overflow-hidden p-1.5 shadow-[var(--shadow-lg,0_10px_30px_rgb(0_0_0/0.12))]">
          <div className="px-3 pb-2 pt-1.5">
            <p className="font-bold text-ink">{name}</p>
            <p className="mt-0.5">
              <span className="pill bg-navy-50 !text-xs text-navy">{roleLabel}</span>
            </p>
          </div>
          <ul className="border-t border-line pt-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <form action={signOutAction} className="mt-1 border-t border-line pt-1">
            <button type="submit" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink">
              <LogOut aria-hidden className="size-4" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
