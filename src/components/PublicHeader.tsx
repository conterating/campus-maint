"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { LogoMark } from "./LogoMark";

/** The site header for people who aren't signed in yet: same brand, with sign-in and sign-up. */
export function PublicHeader() {
  const pathname = usePathname();
  const onLogin = pathname === "/login" || pathname.startsWith("/login/");
  const onSignup = pathname === "/signup";
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:gap-4">
        <Link href="/login" className="flex items-center gap-2.5 rounded-lg pr-1">
          <LogoMark />
          <span className="text-[1.125rem] font-extrabold tracking-[-0.03em] text-navy">
            Ramblin’<span className="ml-1 text-gold-ink">Repairs</span>
          </span>
          <span className="sr-only"> home</span>
        </Link>
        <nav aria-label="Main" className="ml-4 hidden flex-1 md:block">
          <ul className="flex items-center gap-0.5">
            <li>
              <Link href="/login#how-it-works" className="block rounded-lg px-3 py-2 text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/login/staff" className="block rounded-lg px-3 py-2 text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink">
                For staff
              </Link>
            </li>
            <li>
              <Link href="/login/contractor" className="block rounded-lg px-3 py-2 text-sm font-bold text-ink-2 hover:bg-bg hover:text-ink">
                For contractors
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex-1 md:hidden" />
        <div className="flex items-center gap-2">
          {/* On phones, show only the action you don't already have on screen. */}
          <Link href="/login" aria-current={onLogin ? "page" : undefined} className={`btn btn-ghost btn-sm ${onLogin ? "hidden sm:inline-flex" : ""}`}>
            <LogIn aria-hidden className="size-4" /> Sign in
          </Link>
          <Link href="/signup" aria-current={onSignup ? "page" : undefined} className={`btn btn-accent btn-sm ${onLogin ? "" : "hidden sm:inline-flex"}`}>
            <UserPlus aria-hidden className="size-4" /> <span className="hidden min-[400px]:inline">Create account</span>
            <span className="min-[400px]:hidden">Sign up</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
