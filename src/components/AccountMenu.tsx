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
        className={`flex min-h-11 items-center gap-2.5 rounded-[4px] py-1 pl-1 pr-2 transition-colors lg:pr-2.5 ${onNavy ? "hover:bg-white/10" : "hover:bg-surface-2"}`}
      >
        <span className={`rounded-full ${onNavy ? "ring-2 ring-buzz/70" : ""}`}>
          <Avatar name={name} hue={hue} size="sm" />
        </span>
        <span className="hidden flex-col text-left leading-tight lg:flex">
          <span className={`text-[0.9375rem] font-bold ${onNavy ? "text-white" : "text-ink"}`}>{name}</span>
          <span className={`text-[0.8125rem] ${onNavy ? "text-white/75" : "text-ink-3"}`}>{detail}</span>
        </span>
        <span className="sr-only lg:hidden">{name}, </span>
        <span className="sr-only">account menu</span>
        <ChevronDown aria-hidden className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""} ${onNavy ? "text-white/75" : "text-ink-3"}`} />
      </button>
      {open && (
        <div id={id} className="rise absolute right-0 top-[3.25rem] z-50 w-64 overflow-hidden rounded-[6px] border-t-4 border-buzz bg-surface p-1.5 text-ink shadow-[var(--shadow-lg)]">
          <div className="px-3 pb-2.5 pt-2">
            <p className="font-bold text-ink">{name}</p>
            <p className="mt-0.5 font-display text-[0.9375rem] font-bold uppercase tracking-[0.06em] text-gold-ink">{roleLabel}</p>
          </div>
          <ul className="border-t border-line pt-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-[4px] px-3 text-[0.9375rem] font-bold text-ink-2 hover:bg-surface-2 hover:text-navy">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <form action={signOutAction} className="mt-1 border-t border-line pt-1">
            <button type="submit" className="flex min-h-10 w-full items-center gap-2 rounded-[4px] px-3 text-left text-[0.9375rem] font-bold text-ink-2 hover:bg-surface-2 hover:text-navy">
              <LogOut aria-hidden className="size-4" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
