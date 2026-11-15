import Link from "next/link";
import { UserPlus } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { TopNav } from "./NavLinks";

/**
 * The site header for visitors who aren't signed in: the same navy bar as the
 * app, with public tabs (Home, Map, Issues) and Sign in as its own tab.
 */
export function PublicHeader() {
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
