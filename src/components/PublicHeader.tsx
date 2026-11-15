import Link from "next/link";
import { UserPlus } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { TopNav } from "./NavLinks";

/**
 * The site header for visitors who aren't signed in: the same bar as the app,
 * with public tabs (Home, Map, Issues) and Sign in as its own tab.
 */
export function PublicHeader() {
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
          <TopNav role="GUEST" />
        </div>
        <div className="flex-1 md:hidden" />
        <Link href="/signup" className="btn btn-accent btn-sm">
          <UserPlus aria-hidden className="size-4" />
          <span className="hidden min-[400px]:inline">Create account</span>
          <span className="min-[400px]:hidden">Sign up</span>
        </Link>
      </div>
    </header>
  );
}
